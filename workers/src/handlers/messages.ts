/**
 * POST /v1/messages endpoint handler
 * 
 * Handles both streaming and non-streaming message requests.
 * Converts Anthropic API requests to Kiro format, manages token lifecycle,
 * and streams responses back to the client.
 * 
 * **Validates: Requirements 1.2, 1.4, 1.5, 17.1-17.5**
 */

import type { Env } from "../types/env";
import type { MessagesRequest } from "../types/anthropic";
import type { CallContext, KiroEvent } from "../types/kiro";
import { RequestConverter } from "../utils/request-converter";
import { EventStreamDecoder } from "../protocol/decoder";
import { SSEBuilder } from "../protocol/sse-builder";
import { getKiroApiUrl } from "../constants";
import { createErrorResponse, formatSSE, generateId } from "../utils/helpers";
import { Frame } from "../protocol/frame";
import { isWebSearchRequest, executeWebSearch } from "./websearch";
import {
  convertKiroError,
  createAnthropicErrorResponse,
  createCredentialExhaustedError,
  createTimeoutError,
  createInternalError,
  fetchWithTimeout,
  handleStreamingError,
} from "../utils/errors";
import { logError, logStreamingCompletion } from "../utils/logger";

/**
 * Handle POST /v1/messages request
 * 
 * @param request - Incoming HTTP request
 * @param env - Environment bindings
 * @returns Response with message or SSE stream
 */
export async function handleMessages(request: Request, env: Env): Promise<Response> {
  const messageId = generateId("msg");
  
  try {
    // Parse request body
    const body = await request.json() as MessagesRequest;

    // Validate required fields
    if (!body.model) {
      return createAnthropicErrorResponse("invalid_request_error", "Missing required field: model", 400);
    }
    if (!body.max_tokens) {
      return createAnthropicErrorResponse("invalid_request_error", "Missing required field: max_tokens", 400);
    }
    if (!body.messages || body.messages.length === 0) {
      return createAnthropicErrorResponse("invalid_request_error", "Missing required field: messages", 400);
    }

    // Check if this is a WebSearch request
    // **Validates: Requirements 9.1, 9.5**
    if (isWebSearchRequest(body.tools)) {
      // Acquire call context for WebSearch
      const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
      const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
      
      let context: CallContext;
      try {
        const contextResponse = await tokenManager.fetch(new Request("http://internal/acquireContext", {
          method: "POST",
        }));
        
        if (!contextResponse.ok) {
          const errorData = await contextResponse.json() as { error: string };
          throw new Error(errorData.error || "Failed to acquire context");
        }
        
        context = await contextResponse.json() as CallContext;
      } catch (error) {
        logError(error, "Failed to acquire call context", messageId);
        // **Validates: Requirement 13.3**
        return createCredentialExhaustedError();
      }

      // Route to WebSearch handler
      // **Validates: Requirement 9.2**
      return executeWebSearch(body, context, env);
    }

    // Determine if streaming is requested
    const isStreaming = body.stream === true;

    if (isStreaming) {
      return handleStreamingRequest(body, env);
    } else {
      return handleNonStreamingRequest(body, env);
    }
  } catch (error) {
    logError(error, "Error handling /v1/messages request", messageId);
    // **Validates: Requirement 13.5**
    return createInternalError(error, "/v1/messages");
  }
}

/**
 * Check if error response indicates monthly request limit exceeded
 * 
 * @param errorText - Error response text from Kiro API
 * @returns true if error is MONTHLY_REQUEST_COUNT
 */
function isMonthlyRequestLimit(errorText: string): boolean {
  if (errorText.includes("MONTHLY_REQUEST_COUNT")) {
    return true;
  }

  try {
    const errorJson = JSON.parse(errorText);
    
    // Check top-level reason field
    if (errorJson.reason === "MONTHLY_REQUEST_COUNT") {
      return true;
    }
    
    // Check nested error.reason field
    if (errorJson.error?.reason === "MONTHLY_REQUEST_COUNT") {
      return true;
    }
  } catch {
    // Not JSON, ignore
  }

  return false;
}

/**
 * Handle non-streaming message request
 * 
 * **Validates: Requirements 1.2, 1.5, 17.1-17.5**
 * 
 * @param body - Parsed request body
 * @param env - Environment bindings
 * @returns JSON response with complete message
 */
async function handleNonStreamingRequest(body: MessagesRequest, env: Env): Promise<Response> {
  // Acquire call context from TokenManager
  const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
  const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
  
  let context: CallContext;
  try {
    const contextResponse = await tokenManager.fetch(new Request("http://internal/acquireContext", {
      method: "POST",
    }));
    
    if (!contextResponse.ok) {
      const errorData = await contextResponse.json() as { error: string };
      throw new Error(errorData.error || "Failed to acquire context");
    }
    
    context = await contextResponse.json() as CallContext;
  } catch (error) {
    console.error("Failed to acquire call context:", error);
    // **Validates: Requirement 13.3**
    return createCredentialExhaustedError();
  }

  // Convert request to Kiro format
  const converter = new RequestConverter();
  const messageId = generateId("msg");
  const kiroRequest = converter.convertAnthropicToKiro(body, undefined, body.metadata);

  // Build Kiro API URL
  const region = env.KIRO_REGION || "us-east-1";
  const kiroApiUrl = `${getKiroApiUrl(region)}/generateAssistantResponse`;

  try {
    // Send request to Kiro API with timeout
    // **Validates: Requirement 13.4**
    const kiroResponse = await fetchWithTimeout(kiroApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.accessToken}`,
        "x-kiro-version": env.KIRO_VERSION || "0.8.0",
        "x-system-version": env.SYSTEM_VERSION || "darwin#24.6.0",
        "x-node-version": env.NODE_VERSION || "22.21.1",
      },
      body: JSON.stringify(kiroRequest),
    }, 60000);

    if (!kiroResponse.ok) {
      const errorText = await kiroResponse.text();
      
      // Log error with context
      logError(
        new Error(`Kiro API error: ${kiroResponse.status} ${errorText}`),
        "Kiro API request failed",
        messageId,
        context.id
      );
      
      // Check for 402 quota exhausted
      if (kiroResponse.status === 402 && isMonthlyRequestLimit(errorText)) {
        // Report quota exhausted to TokenManager
        const quotaResponse = await tokenManager.fetch(new Request("http://internal/reportQuotaExhausted", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        }));
        
        const { hasAvailable } = await quotaResponse.json() as { hasAvailable: boolean };
        
        if (!hasAvailable) {
          // All credentials exhausted
          return createCredentialExhaustedError("All credentials have exhausted their quota");
        }
        
        // Retry with next credential would happen in a retry loop
        // For now, return the error
      } else {
        // Report failure to TokenManager for other errors
        await tokenManager.fetch(new Request("http://internal/reportFailure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        }));
      }
      
      // **Validates: Requirement 13.1**
      const convertedError = convertKiroError(kiroResponse.status, errorText);
      return createAnthropicErrorResponse(
        convertedError.type,
        convertedError.message,
        convertedError.statusCode
      );
    }

    // Parse binary event stream and collect all events
    const decoder = new EventStreamDecoder();
    const sseBuilder = new SSEBuilder(body.model, messageId);
    
    const reader = kiroResponse.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const allEvents: KiroEvent[] = [];
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Feed chunk to decoder
        decoder.feed(value);
        
        // Decode all available frames
        for (const frame of decoder.decodeAll()) {
          const event = parseKiroEvent(frame);
          if (event) {
            allEvents.push(event);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Process all events to build final response
    let finalResponse: any = {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model: body.model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    // Track content blocks
    const contentBlocks: any[] = [];
    let currentBlock: any = null;
    let stopReason: string | null = null;

    for (const event of allEvents) {
      if (event.type === "assistantResponseEvent") {
        const assistantEvent = event;
        
        // Handle content block start
        if (assistantEvent.contentBlockStart) {
          const blockStart = assistantEvent.contentBlockStart;
          const blockType = blockStart.contentBlock.type;
          
          if (blockType === "text") {
            currentBlock = { type: "text", text: "" };
          } else if (blockType === "thinking") {
            currentBlock = { type: "thinking", thinking: "" };
          } else if (blockType === "tool_use") {
            currentBlock = {
              type: "tool_use",
              id: blockStart.contentBlock.toolUseId || "",
              name: blockStart.contentBlock.toolName || "",
              input: {},
            };
          }
        }
        
        // Handle content block delta
        if (assistantEvent.contentBlockDelta && currentBlock) {
          const delta = assistantEvent.contentBlockDelta.delta;
          
          if (delta.text !== undefined && currentBlock.type === "text") {
            currentBlock.text += delta.text;
          } else if (delta.thinking !== undefined && currentBlock.type === "thinking") {
            currentBlock.thinking += delta.thinking;
          } else if (delta.toolInput !== undefined && currentBlock.type === "tool_use") {
            // Accumulate JSON input
            try {
              const partial = JSON.parse(delta.toolInput);
              currentBlock.input = { ...currentBlock.input, ...partial };
            } catch {
              // Ignore parse errors for partial JSON
            }
          }
        }
        
        // Handle content block stop
        if (assistantEvent.contentBlockStop && currentBlock) {
          contentBlocks.push(currentBlock);
          currentBlock = null;
        }
        
        // Handle message stop
        if (assistantEvent.messageStop) {
          stopReason = assistantEvent.messageStop.stopReason;
        }
      } else if (event.type === "contextUsageEvent") {
        finalResponse.usage.input_tokens = event.inputTokens || 0;
        finalResponse.usage.output_tokens = event.outputTokens || 0;
      }
    }

    // Add any remaining block
    if (currentBlock) {
      contentBlocks.push(currentBlock);
    }

    finalResponse.content = contentBlocks;
    finalResponse.stop_reason = stopReason || "end_turn";

    // Report success to TokenManager
    await tokenManager.fetch(new Request("http://internal/reportSuccess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: context.id }),
    }));

    return new Response(JSON.stringify(finalResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error processing Kiro API response", messageId, context.id);
    
    // Report failure to TokenManager
    await tokenManager.fetch(new Request("http://internal/reportFailure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: context.id }),
    }));
    
    // Check if error is timeout
    // **Validates: Requirement 13.4**
    if (error instanceof Error && error.message === "Request timeout") {
      return createTimeoutError();
    }
    
    // **Validates: Requirement 13.5**
    return createInternalError(error, "handleNonStreamingRequest");
  }
}

/**
 * Handle streaming message request
 * 
 * **Validates: Requirements 1.4, 5.1-5.5, 6.1-6.5**
 * 
 * @param body - Parsed request body
 * @param env - Environment bindings
 * @returns SSE stream response
 */
async function handleStreamingRequest(body: MessagesRequest, env: Env): Promise<Response> {
  // Acquire call context from TokenManager
  const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
  const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
  
  let context: CallContext;
  try {
    const contextResponse = await tokenManager.fetch(new Request("http://internal/acquireContext", {
      method: "POST",
    }));
    
    if (!contextResponse.ok) {
      const errorData = await contextResponse.json() as { error: string };
      throw new Error(errorData.error || "Failed to acquire context");
    }
    
    context = await contextResponse.json() as CallContext;
  } catch (error) {
    console.error("Failed to acquire call context:", error);
    // **Validates: Requirement 13.3**
    return createCredentialExhaustedError();
  }

  // Convert request to Kiro format
  const converter = new RequestConverter();
  const messageId = generateId("msg");
  const kiroRequest = converter.convertAnthropicToKiro(body, undefined, body.metadata);

  // Build Kiro API URL
  const region = env.KIRO_REGION || "us-east-1";
  const kiroApiUrl = `${getKiroApiUrl(region)}/generateAssistantResponse`;

  // Create streaming response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start streaming in background
  (async () => {
    try {
      // Send request to Kiro API with timeout
      // **Validates: Requirement 13.4**
      const kiroResponse = await fetchWithTimeout(kiroApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${context.accessToken}`,
          "x-kiro-version": env.KIRO_VERSION || "0.8.0",
          "x-system-version": env.SYSTEM_VERSION || "darwin#24.6.0",
          "x-node-version": env.NODE_VERSION || "22.21.1",
        },
        body: JSON.stringify(kiroRequest),
      }, 60000);

      if (!kiroResponse.ok) {
        const errorText = await kiroResponse.text();
        
        // Log error with context
        logError(
          new Error(`Kiro API error: ${kiroResponse.status} ${errorText}`),
          "Kiro API streaming request failed",
          messageId,
          context.id
        );
        
        // Check for 402 quota exhausted
        if (kiroResponse.status === 402 && isMonthlyRequestLimit(errorText)) {
          // Report quota exhausted to TokenManager
          const quotaResponse = await tokenManager.fetch(new Request("http://internal/reportQuotaExhausted", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credentialId: context.id }),
          }));
          
          const { hasAvailable } = await quotaResponse.json() as { hasAvailable: boolean };
          
          if (!hasAvailable) {
            // All credentials exhausted
            const errorEvent = formatSSE("error", {
              error: {
                type: "overloaded_error",
                message: "All credentials have exhausted their quota",
              },
            });
            await writer.write(encoder.encode(errorEvent));
            await writer.close();
            return;
          }
        } else {
          // Report failure to TokenManager for other errors
          await tokenManager.fetch(new Request("http://internal/reportFailure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credentialId: context.id }),
          }));
        }
        
        // **Validates: Requirement 13.1**
        const convertedError = convertKiroError(kiroResponse.status, errorText);
        const errorEvent = formatSSE("error", {
          error: {
            type: convertedError.type,
            message: convertedError.message,
          },
        });
        await writer.write(encoder.encode(errorEvent));
        await writer.close();
        return;
      }

      // Create decoder and SSE builder
      const decoder = new EventStreamDecoder();
      const sseBuilder = new SSEBuilder(body.model, messageId);
      
      const reader = kiroResponse.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      let eventCount = 0;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Feed chunk to decoder
          decoder.feed(value);
          
          // Decode all available frames
          for (const frame of decoder.decodeAll()) {
            const event = parseKiroEvent(frame);
            if (event) {
              // Process event through SSE builder
              const sseEvents = sseBuilder.processKiroEvent(event);
              
              // Write SSE events to stream
              for (const sseEvent of sseEvents) {
                const sseData = formatSSE(sseEvent.type, sseEvent);
                await writer.write(encoder.encode(sseData));
                eventCount++;
              }
            }
          }
        }
        
        // Generate final events
        const finalEvents = sseBuilder.generateFinalEvents();
        for (const sseEvent of finalEvents) {
          const sseData = formatSSE(sseEvent.type, sseEvent);
          await writer.write(encoder.encode(sseData));
          eventCount++;
        }
        
        // Log streaming completion
        logStreamingCompletion(
          eventCount,
          sseBuilder.getInputTokens(),
          sseBuilder.getOutputTokens(),
          sseBuilder.getThinkingTokens(),
          messageId,
          context.id
        );
        
        // Report success to TokenManager
        await tokenManager.fetch(new Request("http://internal/reportSuccess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        }));
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      logError(error, "Error streaming response", messageId, context.id);
      
      // Report failure to TokenManager
      await tokenManager.fetch(new Request("http://internal/reportFailure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: context.id }),
      }));
      
      // **Validates: Requirement 13.2, 13.4, 13.5**
      // Handle streaming error gracefully
      if (error instanceof Error && error.message === "Request timeout") {
        await handleStreamingError(writer, new Error("Request to upstream API timed out"), "handleStreamingRequest", messageId, context.id);
      } else {
        await handleStreamingError(writer, error, "handleStreamingRequest", messageId, context.id);
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Parse a Kiro event from a frame
 * 
 * @param frame - Decoded frame
 * @returns Parsed Kiro event or null
 */
function parseKiroEvent(frame: Frame): KiroEvent | null {
  try {
    const eventType = frame.headers.eventType;
    if (!eventType) {
      return null;
    }

    const payloadText = new TextDecoder().decode(frame.payload);
    const payloadJson = JSON.parse(payloadText);

    // Map event type to Kiro event structure
    if (eventType === "assistantResponseEvent") {
      return {
        type: "assistantResponseEvent",
        ...payloadJson,
      };
    } else if (eventType === "toolUseEvent") {
      return {
        type: "toolUseEvent",
        ...payloadJson,
      };
    } else if (eventType === "contextUsageEvent") {
      return {
        type: "contextUsageEvent",
        ...payloadJson,
      };
    } else if (eventType === "meteringEvent") {
      return {
        type: "meteringEvent",
      };
    } else if (eventType === "error") {
      return {
        type: "error",
        ...payloadJson,
      };
    } else if (eventType === "exception") {
      return {
        type: "exception",
        ...payloadJson,
      };
    }

    return null;
  } catch (error) {
    console.warn("Failed to parse Kiro event:", error);
    return null;
  }
}
