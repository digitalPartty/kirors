/**
 * Error Handling and Conversion Utilities
 * 
 * Provides utilities for converting Kiro API errors to Anthropic-compatible
 * error responses, handling timeouts, and managing network errors.
 * 
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5**
 */

import type { ErrorResponse } from "../types/anthropic";
import { logError } from "./logger";

/**
 * Anthropic error types
 */
export type AnthropicErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error"
  | "api_error"
  | "overloaded_error";

/**
 * Error conversion result
 */
export interface ConvertedError {
  type: AnthropicErrorType;
  message: string;
  statusCode: number;
}

/**
 * Convert HTTP status code to Anthropic error type
 * 
 * **Validates: Requirement 13.1**
 * 
 * Maps Kiro API HTTP status codes to appropriate Anthropic error types
 * following Anthropic's error response specification.
 * 
 * @param statusCode - HTTP status code from Kiro API
 * @returns Anthropic error type
 */
export function mapStatusToErrorType(statusCode: number): AnthropicErrorType {
  if (statusCode >= 400 && statusCode < 500) {
    // Client errors
    switch (statusCode) {
      case 400:
        return "invalid_request_error";
      case 401:
        return "authentication_error";
      case 403:
        return "permission_error";
      case 404:
        return "not_found_error";
      case 429:
        return "rate_limit_error";
      default:
        return "invalid_request_error";
    }
  } else if (statusCode >= 500 && statusCode < 600) {
    // Server errors
    if (statusCode === 503) {
      return "overloaded_error";
    }
    return "api_error";
  }
  
  // Default to api_error for unexpected status codes
  return "api_error";
}

/**
 * Convert Kiro API error to Anthropic error format
 * 
 * **Validates: Requirement 13.1**
 * 
 * Converts Kiro API 4xx/5xx errors to Anthropic-compatible error responses
 * with appropriate status codes and error messages.
 * 
 * @param statusCode - HTTP status code from Kiro API
 * @param errorMessage - Error message from Kiro API (optional)
 * @returns Converted error with type, message, and status code
 */
export function convertKiroError(
  statusCode: number,
  errorMessage?: string
): ConvertedError {
  const errorType = mapStatusToErrorType(statusCode);
  
  // Use provided error message or generate default based on status code
  let message = errorMessage || getDefaultErrorMessage(statusCode);
  
  return {
    type: errorType,
    message,
    statusCode,
  };
}

/**
 * Get default error message for HTTP status code
 * 
 * @param statusCode - HTTP status code
 * @returns Default error message
 */
function getDefaultErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "Invalid request parameters";
    case 401:
      return "Authentication failed";
    case 403:
      return "Permission denied";
    case 404:
      return "Resource not found";
    case 429:
      return "Rate limit exceeded";
    case 500:
      return "Internal server error";
    case 502:
      return "Bad gateway";
    case 503:
      return "Service temporarily unavailable";
    case 504:
      return "Gateway timeout";
    default:
      return `HTTP error ${statusCode}`;
  }
}

/**
 * Create Anthropic-compatible error response
 * 
 * **Validates: Requirement 13.1**
 * 
 * Creates a Response object with Anthropic's error format:
 * { type: "error", error: { type: "error_type", message: "..." } }
 * 
 * @param errorType - Anthropic error type
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @returns Response object with error
 */
export function createAnthropicErrorResponse(
  errorType: AnthropicErrorType,
  message: string,
  statusCode: number
): Response {
  const errorResponse: ErrorResponse = {
    error: {
      type: errorType,
      message,
    },
  };
  
  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create 503 Service Unavailable response for credential exhaustion
 * 
 * **Validates: Requirement 13.3**
 * 
 * Returns 503 Service Unavailable when TokenManager cannot acquire
 * a valid CallContext due to all credentials failing.
 * 
 * @param message - Optional custom message
 * @returns Response with 503 status
 */
export function createCredentialExhaustedError(
  message: string = "No available credentials - all credentials have failed or are disabled"
): Response {
  return createAnthropicErrorResponse(
    "overloaded_error",
    message,
    503
  );
}

/**
 * Create 504 Gateway Timeout response
 * 
 * **Validates: Requirement 13.4**
 * 
 * Returns 504 Gateway Timeout when Kiro API response times out.
 * 
 * @param message - Optional custom message
 * @returns Response with 504 status
 */
export function createTimeoutError(
  message: string = "Request to upstream API timed out"
): Response {
  return createAnthropicErrorResponse(
    "api_error",
    message,
    504
  );
}

/**
 * Create 500 Internal Server Error response
 * 
 * **Validates: Requirement 13.5**
 * 
 * Returns 500 Internal Server Error for unexpected exceptions.
 * Logs error details for debugging.
 * 
 * @param error - The caught error
 * @param context - Optional context information
 * @param requestId - Optional request ID
 * @param credentialId - Optional credential ID
 * @returns Response with 500 status
 */
export function createInternalError(
  error: unknown,
  context?: string,
  requestId?: string,
  credentialId?: string
): Response {
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  
  // Log error details using structured logger
  logError(error, context, requestId, credentialId);
  
  return createAnthropicErrorResponse(
    "api_error",
    message,
    500
  );
}

/**
 * Timeout wrapper for fetch requests
 * 
 * **Validates: Requirement 13.4**
 * 
 * Wraps a fetch request with a timeout. If the request takes longer
 * than the specified timeout, aborts the request and throws an error.
 * 
 * @param url - Request URL
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns Promise that resolves to Response or rejects on timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 60000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Check if error is due to abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timeout");
    }
    
    throw error;
  }
}

/**
 * Format SSE error event
 * 
 * **Validates: Requirement 13.2**
 * 
 * Creates an SSE error event for streaming responses.
 * Used when network errors occur during streaming.
 * 
 * @param errorType - Anthropic error type
 * @param message - Error message
 * @returns Formatted SSE error event string
 */
export function formatSSEError(
  errorType: AnthropicErrorType,
  message: string
): string {
  const errorEvent = {
    type: "error",
    error: {
      type: errorType,
      message,
    },
  };
  
  return `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
}

/**
 * Handle streaming error
 * 
 * **Validates: Requirement 13.2**
 * 
 * Handles network errors during streaming by closing the SSE connection
 * gracefully with an error event.
 * 
 * @param writer - WritableStreamDefaultWriter to write error event
 * @param error - The caught error
 * @param context - Optional context information
 * @param requestId - Optional request ID
 * @param credentialId - Optional credential ID
 */
export async function handleStreamingError(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  error: unknown,
  context?: string,
  requestId?: string,
  credentialId?: string
): Promise<void> {
  const message = error instanceof Error ? error.message : "Streaming error occurred";
  
  // Log error using structured logger
  logError(error, context, requestId, credentialId);
  
  // Send error event to client
  const encoder = new TextEncoder();
  const errorEvent = formatSSEError("api_error", message);
  
  try {
    await writer.write(encoder.encode(errorEvent));
  } catch (writeError) {
    // If we can't write the error event, log it
    logError(writeError, "Failed to write error event to stream", requestId, credentialId);
  }
}
