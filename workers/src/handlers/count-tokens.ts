/**
 * POST /v1/messages/count_tokens endpoint handler
 * 
 * Handles token counting requests with external API integration and fallback estimation.
 * 
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
 */

import type { Env } from "../types/env";
import type { CountTokensRequest, CountTokensResponse } from "../types/anthropic";
import { createErrorResponse } from "../utils/helpers";
import {
  createAnthropicErrorResponse,
  createInternalError,
  fetchWithTimeout,
} from "../utils/errors";

/**
 * Handle POST /v1/messages/count_tokens request
 * 
 * @param request - Incoming HTTP request
 * @param env - Environment bindings
 * @returns Response with token count
 */
export async function handleCountTokens(request: Request, env: Env): Promise<Response> {
  try {
    // Parse request body
    const body = await request.json() as CountTokensRequest;

    // Validate required fields
    if (!body.model) {
      return createAnthropicErrorResponse("invalid_request_error", "Missing required field: model", 400);
    }
    if (!body.messages || body.messages.length === 0) {
      return createAnthropicErrorResponse("invalid_request_error", "Missing required field: messages", 400);
    }

    // Try external API if configured
    if (env.COUNT_TOKENS_API_URL && env.COUNT_TOKENS_API_KEY) {
      try {
        const externalCount = await countTokensWithExternalAPI(body, env);
        return new Response(JSON.stringify(externalCount), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        console.warn("External token counting API failed, falling back to estimation:", error);
        // Fall through to fallback estimation
      }
    }

    // Use fallback estimation
    const estimatedCount = estimateTokenCount(body);
    return new Response(JSON.stringify(estimatedCount), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error handling /v1/messages/count_tokens request:", error);
    return createInternalError(error, "/v1/messages/count_tokens");
  }
}

/**
 * Count tokens using external API
 * 
 * **Validates: Requirements 10.1, 10.2**
 * 
 * @param body - Token counting request
 * @param env - Environment bindings
 * @returns Token count response
 * @throws Error if external API fails
 */
async function countTokensWithExternalAPI(
  body: CountTokensRequest,
  env: Env
): Promise<CountTokensResponse> {
  const apiUrl = env.COUNT_TOKENS_API_URL!;
  const apiKey = env.COUNT_TOKENS_API_KEY!;
  const authType = env.COUNT_TOKENS_AUTH_TYPE || "x-api-key";

  // Build headers based on auth type
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authType === "x-api-key") {
    headers["x-api-key"] = apiKey;
  } else if (authType === "bearer") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    // Default to x-api-key
    headers["x-api-key"] = apiKey;
  }

  // Forward request to external API with timeout
  const response = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, 30000); // 30 second timeout for token counting

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`External API error: ${response.status} ${errorText}`);
  }

  const result = await response.json() as CountTokensResponse;
  return result;
}

/**
 * Estimate token count using fallback algorithm
 * 
 * **Validates: Requirements 10.3, 10.4, 10.5**
 * 
 * Uses a simple character-based estimation: approximately 4 characters per token.
 * This is a rough estimate and may not be accurate for all content types.
 * 
 * @param body - Token counting request
 * @returns Estimated token count
 */
function estimateTokenCount(body: CountTokensRequest): CountTokensResponse {
  let totalChars = 0;

  // Count system prompt characters
  if (body.system) {
    if (typeof body.system === "string") {
      totalChars += body.system.length;
    } else {
      for (const systemMsg of body.system) {
        totalChars += systemMsg.text.length;
      }
    }
  }

  // Count message characters
  for (const message of body.messages) {
    if (typeof message.content === "string") {
      totalChars += message.content.length;
    } else {
      for (const block of message.content) {
        if (block.text) {
          totalChars += block.text.length;
        }
        if (block.thinking) {
          totalChars += block.thinking.length;
        }
        // Tool use content is typically JSON, estimate based on stringified size
        if (block.input) {
          totalChars += JSON.stringify(block.input).length;
        }
        if (block.content) {
          totalChars += JSON.stringify(block.content).length;
        }
      }
    }
  }

  // Count tool definition characters
  if (body.tools) {
    for (const tool of body.tools) {
      totalChars += tool.name.length;
      if (tool.description) {
        totalChars += tool.description.length;
      }
      if (tool.input_schema) {
        totalChars += JSON.stringify(tool.input_schema).length;
      }
    }
  }

  // Estimate tokens: approximately 4 characters per token
  const estimatedTokens = Math.ceil(totalChars / 4);

  return {
    input_tokens: estimatedTokens,
  };
}
