/**
 * WebSearch MCP Tool Integration Handler
 * 
 * Handles detection and routing of WebSearch requests to the MCP API endpoint.
 * Converts between Anthropic tool format and JSON-RPC format for MCP API.
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 */

import type { Env } from "../types/env";
import type { MessagesRequest, Tool } from "../types/anthropic";
import type { CallContext } from "../types/kiro";
import { getKiroMcpApiUrl } from "../constants";
import { createErrorResponse, generateId } from "../utils/helpers";
import {
  convertKiroError,
  createAnthropicErrorResponse,
  createTimeoutError,
  createInternalError,
  fetchWithTimeout,
} from "../utils/errors";
import { logError } from "../utils/logger";

/**
 * JSON-RPC request format for MCP API
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * JSON-RPC response format from MCP API
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: {
    content: Array<{
      type: string;
      text?: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Detect if request contains exactly one web_search tool
 * 
 * **Validates: Requirement 9.1**
 * 
 * @param tools - Tools array from Anthropic request
 * @returns True if this is a WebSearch request
 */
export function isWebSearchRequest(tools: Tool[] | undefined): boolean {
  if (!tools || tools.length !== 1) {
    return false;
  }
  
  return tools[0].name === "web_search";
}

/**
 * Convert Anthropic tool format to JSON-RPC format for MCP API
 * 
 * **Validates: Requirement 9.2**
 * 
 * @param tool - Anthropic tool definition
 * @param toolInput - Tool input arguments
 * @returns JSON-RPC request object
 */
export function convertToJsonRpc(
  tool: Tool,
  toolInput: Record<string, unknown>
): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: generateId("rpc"),
    method: "tools/call",
    params: {
      name: tool.name,
      arguments: toolInput,
    },
  };
}

/**
 * Convert JSON-RPC response to Anthropic tool result format
 * 
 * **Validates: Requirement 9.3**
 * 
 * @param jsonRpcResponse - JSON-RPC response from MCP API
 * @returns Anthropic tool result content
 */
export function convertFromJsonRpc(
  jsonRpcResponse: JsonRpcResponse
): Array<{ type: string; text: string }> {
  // Handle error response
  if (jsonRpcResponse.error) {
    return [
      {
        type: "text",
        text: `Error: ${jsonRpcResponse.error.message}`,
      },
    ];
  }
  
  // Handle successful response
  if (jsonRpcResponse.result?.content) {
    return jsonRpcResponse.result.content.map((item) => ({
      type: item.type || "text",
      text: item.text || "",
    }));
  }
  
  // Fallback for empty response
  return [
    {
      type: "text",
      text: "No results returned",
    },
  ];
}

/**
 * Handle MCP API errors and convert to Anthropic error format
 * 
 * **Validates: Requirement 9.4, 13.1, 13.4, 13.5**
 * 
 * @param error - Error from MCP API
 * @param messageId - Optional message ID for logging
 * @param credentialId - Optional credential ID for logging
 * @returns Anthropic-compatible error response
 */
export function handleMcpError(error: unknown, messageId?: string, credentialId?: string): Response {
  logError(error, "MCP API error", messageId, credentialId);
  
  // Check if error is timeout
  if (error instanceof Error && error.message === "Request timeout") {
    return createTimeoutError("MCP API request timed out");
  }
  
  // Handle other errors
  return createInternalError(error, "MCP API");
}

/**
 * Execute WebSearch request via MCP API
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 * 
 * @param body - Anthropic messages request
 * @param context - Call context with credentials
 * @param env - Environment bindings
 * @returns Response with search results
 */
export async function executeWebSearch(
  body: MessagesRequest,
  context: CallContext,
  env: Env
): Promise<Response> {
  const messageId = generateId("msg");
  
  try {
    // Extract tool and tool input from the last message
    const lastMessage = body.messages[body.messages.length - 1];
    if (!lastMessage || typeof lastMessage.content === "string") {
      return createErrorResponse(
        "invalid_request_error",
        "WebSearch requires tool_use content in the last message",
        400
      );
    }
    
    // Find tool_use block
    const toolUseBlock = Array.isArray(lastMessage.content)
      ? lastMessage.content.find((block) => block.type === "tool_use")
      : null;
    
    if (!toolUseBlock || !toolUseBlock.input) {
      return createErrorResponse(
        "invalid_request_error",
        "No tool_use block found in message",
        400
      );
    }
    
    // Get the web_search tool definition
    const webSearchTool = body.tools?.[0];
    if (!webSearchTool) {
      return createErrorResponse(
        "invalid_request_error",
        "No web_search tool definition found",
        400
      );
    }
    
    // Convert to JSON-RPC format
    const jsonRpcRequest = convertToJsonRpc(
      webSearchTool,
      toolUseBlock.input as Record<string, unknown>
    );
    
    // Build MCP API URL
    const region = env.KIRO_REGION || "us-east-1";
    const mcpApiUrl = getKiroMcpApiUrl(region);
    
    // Send request to MCP API with timeout
    const mcpResponse = await fetchWithTimeout(mcpApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.accessToken}`,
      },
      body: JSON.stringify(jsonRpcRequest),
    }, 60000);
    
    if (!mcpResponse.ok) {
      const errorText = await mcpResponse.text();
      
      // Log error with context
      logError(
        new Error(`MCP API HTTP error: ${mcpResponse.status} ${errorText}`),
        "MCP API request failed",
        messageId,
        context.id
      );
      
      // Convert Kiro error to Anthropic format
      const convertedError = convertKiroError(mcpResponse.status, errorText);
      return createAnthropicErrorResponse(
        convertedError.type,
        convertedError.message,
        convertedError.statusCode
      );
    }
    
    // Parse JSON-RPC response
    const jsonRpcResponse = (await mcpResponse.json()) as JsonRpcResponse;
    
    // Convert to Anthropic format
    const toolResults = convertFromJsonRpc(jsonRpcResponse);
    
    // Build Anthropic response
    const response = {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseBlock.id || generateId("tool"),
          content: toolResults,
        },
      ],
      model: body.model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return handleMcpError(error, messageId, context.id);
  }
}
