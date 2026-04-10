/**
 * Claude Code Compatibility Mode Handler
 * 
 * Handles /cc/v1/messages endpoint with buffered streaming to provide
 * accurate token counts in message_start event.
 * 
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5**
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
import {
  convertKiroError,
  createAnthropicErrorResponse,
  createCredentialExhaustedError,
  createTimeoutError,
  createInternalError,
  fetchWithTimeout,
  handleStreamingError,
} from "../utils/errors";

/**
 * Handle POST /cc/v1/messages request with buffered streaming
 * 
 * This handler buffers all upstream events until the stream completes,
 * extracts accurate input_tokens from contextUsageEvent, updates the
 * message_start event, and emits ping events to keep connection alive.
 * 
 * @param request - Incoming HTTP request
 * @param env - Environment bindings
 * @returns Response with buffered SSE stream
 */
export async function handleClaudeCodeMessages(request: Request, env: Env): Promise<Response> {
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

    // Only handle streaming requests
    if (body.stream !== true) {
      return createAnthropicErrorResponse("invalid_request_error", "Claude Code mode requires stream: true", 400);
    }

    return handleBufferedStreamingRequest(body, env);
  } catch (error) {
    console.error("Error handling /cc/v1/messages request:", error);
    return createInternalError(error, "/cc/v1/messages");
  }
}

/**
 * Handle buffered streaming request for Claude Code compatibility
 * 
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5**
 * 
 * @param body - Parsed request body
 * @param env - Environment bindings
 * @returns SSE stream response with buffered events
 */
async function handleBufferedStreamingRequest(body: MessagesRequest, env: Env): Promise<Response> {
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

  // Start buffered streaming in background
  (async () => {
    let writerClosed = false;
    
    try {
      // Send request to Kiro API with timeout
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
        console.error(`Kiro API error: ${kiroResponse.status} ${errorText}`);
        
        // Report failure to TokenManager
        await tokenManager.fetch(new Request("http://internal/reportFailure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        }));
        
        // Send error event
        const convertedError = convertKiroError(kiroResponse.status, errorText);
        const errorEvent = formatSSE("error", {
          error: {
            type: convertedError.type,
            message: convertedError.message,
          },
        });
        await writer.write(encoder.encode(errorEvent));
        await writer.close();
        writerClosed = true;
        return;
      }

      // Buffer all events until stream completes
      const bufferedSSEEvents: string[] = [];
      let accurateInputTokens: number | null = null;
      
      // Create decoder and SSE builder
      const decoder = new EventStreamDecoder();
      const sseBuilder = new SSEBuilder(body.model, messageId);
      
      const reader = kiroResponse.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      // Start ping interval (25 seconds)
      const pingInterval = setInterval(async () => {
        const pingEvent = formatSSE("ping", {});
        await writer.write(encoder.encode(pingEvent));
      }, 25000);

      try {
        // Buffer all events
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Feed chunk to decoder
          decoder.feed(value);
          
          // Decode all available frames
          for (const frame of decoder.decodeAll()) {
            const event = parseKiroEvent(frame);
            if (event) {
              // Extract accurate input tokens from contextUsageEvent
              if (event.type === "contextUsageEvent" && event.inputTokens !== undefined) {
                accurateInputTokens = event.inputTokens;
              }
              
              // Process event through SSE builder
              const sseEvents = sseBuilder.processKiroEvent(event);
              
              // Buffer SSE events
              for (const sseEvent of sseEvents) {
                const sseData = formatSSE(sseEvent.type, sseEvent);
                bufferedSSEEvents.push(sseData);
              }
            }
          }
        }
        
        // Generate final events
        const finalEvents = sseBuilder.generateFinalEvents();
        for (const sseEvent of finalEvents) {
          const sseData = formatSSE(sseEvent.type, sseEvent);
          bufferedSSEEvents.push(sseData);
        }
        
        // Clear ping interval
        clearInterval(pingInterval);
        
        // Update message_start event with accurate input_tokens
        if (accurateInputTokens !== null && bufferedSSEEvents.length > 0) {
          const firstEvent = bufferedSSEEvents[0];
          if (firstEvent.includes('"type":"message_start"')) {
            // Parse and update the message_start event
            const updatedEvent = updateMessageStartTokens(firstEvent, accurateInputTokens);
            bufferedSSEEvents[0] = updatedEvent;
          }
        }
        
        // Send all buffered events in correct order
        for (const sseData of bufferedSSEEvents) {
          await writer.write(encoder.encode(sseData));
        }
        
        // Report success to TokenManager
        await tokenManager.fetch(new Request("http://internal/reportSuccess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        }));
      } finally {
        clearInterval(pingInterval);
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      
      // Report failure to TokenManager
      await tokenManager.fetch(new Request("http://internal/reportFailure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: context.id }),
      }));
      
      // Handle streaming error gracefully
      if (error instanceof Error && error.message === "Request timeout") {
        await handleStreamingError(writer, new Error("Request to upstream API timed out"), "handleBufferedStreamingRequest");
      } else {
        await handleStreamingError(writer, error, "handleBufferedStreamingRequest");
      }
    } finally {
      if (!writerClosed) {
        await writer.close();
      }
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

/**
 * Update message_start event with accurate input_tokens
 * 
 * @param sseData - Original SSE event data
 * @param inputTokens - Accurate input token count
 * @returns Updated SSE event data
 */
function updateMessageStartTokens(sseData: string, inputTokens: number): string {
  try {
    // Extract the JSON data from SSE format
    const lines = sseData.split('\n');
    let dataLine = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLine = line.substring(6);
        break;
      }
    }
    
    if (!dataLine) {
      return sseData;
    }
    
    // Parse and update the event
    const eventData = JSON.parse(dataLine);
    if (eventData.type === 'message_start' && eventData.message && eventData.message.usage) {
      eventData.message.usage.input_tokens = inputTokens;
    }
    
    // Reconstruct SSE format
    return `event: message_start\ndata: ${JSON.stringify(eventData)}\n\n`;
  } catch (error) {
    console.warn("Failed to update message_start tokens:", error);
    return sseData;
  }
}
