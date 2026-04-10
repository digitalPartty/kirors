/**
 * Unit tests for error handling utilities
 * 
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mapStatusToErrorType,
  convertKiroError,
  createAnthropicErrorResponse,
  createCredentialExhaustedError,
  createTimeoutError,
  createInternalError,
  fetchWithTimeout,
  formatSSEError,
  handleStreamingError,
} from "./errors";

describe("Error Handling Utilities", () => {
  describe("mapStatusToErrorType", () => {
    /**
     * **Validates: Requirement 13.1**
     * Test error conversion for various HTTP status codes
     */
    it("should map 400 to invalid_request_error", () => {
      expect(mapStatusToErrorType(400)).toBe("invalid_request_error");
    });

    it("should map 401 to authentication_error", () => {
      expect(mapStatusToErrorType(401)).toBe("authentication_error");
    });

    it("should map 403 to permission_error", () => {
      expect(mapStatusToErrorType(403)).toBe("permission_error");
    });

    it("should map 404 to not_found_error", () => {
      expect(mapStatusToErrorType(404)).toBe("not_found_error");
    });

    it("should map 429 to rate_limit_error", () => {
      expect(mapStatusToErrorType(429)).toBe("rate_limit_error");
    });

    it("should map 4xx to invalid_request_error by default", () => {
      expect(mapStatusToErrorType(418)).toBe("invalid_request_error");
    });

    it("should map 500 to api_error", () => {
      expect(mapStatusToErrorType(500)).toBe("api_error");
    });

    it("should map 503 to overloaded_error", () => {
      expect(mapStatusToErrorType(503)).toBe("overloaded_error");
    });

    it("should map 5xx to api_error by default", () => {
      expect(mapStatusToErrorType(502)).toBe("api_error");
    });
  });

  describe("convertKiroError", () => {
    /**
     * **Validates: Requirement 13.1**
     * Test error conversion with custom messages
     */
    it("should convert 400 error with custom message", () => {
      const result = convertKiroError(400, "Invalid parameters");
      expect(result).toEqual({
        type: "invalid_request_error",
        message: "Invalid parameters",
        statusCode: 400,
      });
    });

    it("should convert 401 error with default message", () => {
      const result = convertKiroError(401);
      expect(result).toEqual({
        type: "authentication_error",
        message: "Authentication failed",
        statusCode: 401,
      });
    });

    it("should convert 429 error with custom message", () => {
      const result = convertKiroError(429, "Rate limit exceeded for this credential");
      expect(result).toEqual({
        type: "rate_limit_error",
        message: "Rate limit exceeded for this credential",
        statusCode: 429,
      });
    });

    it("should convert 500 error with default message", () => {
      const result = convertKiroError(500);
      expect(result).toEqual({
        type: "api_error",
        message: "Internal server error",
        statusCode: 500,
      });
    });

    it("should convert 503 error with custom message", () => {
      const result = convertKiroError(503, "Service temporarily unavailable");
      expect(result).toEqual({
        type: "overloaded_error",
        message: "Service temporarily unavailable",
        statusCode: 503,
      });
    });
  });

  describe("createAnthropicErrorResponse", () => {
    /**
     * **Validates: Requirement 13.1**
     * Test Anthropic error response format
     */
    it("should create response with correct format", async () => {
      const response = createAnthropicErrorResponse(
        "invalid_request_error",
        "Missing required field",
        400
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Missing required field",
        },
      });
    });

    it("should create authentication error response", async () => {
      const response = createAnthropicErrorResponse(
        "authentication_error",
        "Invalid API key",
        401
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.type).toBe("authentication_error");
    });
  });

  describe("createCredentialExhaustedError", () => {
    /**
     * **Validates: Requirement 13.3**
     * Test credential exhaustion scenario
     */
    it("should create 503 response with default message", async () => {
      const response = createCredentialExhaustedError();

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.type).toBe("overloaded_error");
      expect(body.error.message).toContain("No available credentials");
    });

    it("should create 503 response with custom message", async () => {
      const response = createCredentialExhaustedError("All credentials failed");

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.message).toBe("All credentials failed");
    });
  });

  describe("createTimeoutError", () => {
    /**
     * **Validates: Requirement 13.4**
     * Test timeout handling
     */
    it("should create 504 response with default message", async () => {
      const response = createTimeoutError();

      expect(response.status).toBe(504);
      const body = await response.json();
      expect(body.error.type).toBe("api_error");
      expect(body.error.message).toContain("timed out");
    });

    it("should create 504 response with custom message", async () => {
      const response = createTimeoutError("Request took too long");

      expect(response.status).toBe(504);
      const body = await response.json();
      expect(body.error.message).toBe("Request took too long");
    });
  });

  describe("createInternalError", () => {
    /**
     * **Validates: Requirement 13.5**
     * Test internal error handling with logging
     */
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should create 500 response from Error object", async () => {
      const error = new Error("Something went wrong");
      const response = createInternalError(error);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.type).toBe("api_error");
      expect(body.error.message).toBe("Something went wrong");
      expect(console.error).toHaveBeenCalled();
    });

    it("should create 500 response from unknown error", async () => {
      const response = createInternalError("string error");

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.message).toBe("An unexpected error occurred");
    });

    it("should log error with context", async () => {
      const error = new Error("Test error");
      createInternalError(error, "test-context");

      // Expect structured JSON logging
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"context":"test-context"')
      );
    });
  });

  describe("fetchWithTimeout", () => {
    /**
     * **Validates: Requirement 13.4**
     * Test timeout handling for fetch requests
     */
    it("should complete successfully before timeout", async () => {
      const mockResponse = new Response("OK", { status: 200 });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await fetchWithTimeout("https://example.com", {}, 5000);

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should throw timeout error when AbortError occurs", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(fetchWithTimeout("https://example.com", {}, 1000)).rejects.toThrow(
        "Request timeout"
      );
    });

    it("should use default timeout of 60 seconds", async () => {
      const mockResponse = new Response("OK", { status: 200 });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await fetchWithTimeout("https://example.com");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should propagate non-timeout errors", async () => {
      const networkError = new Error("Network error");
      global.fetch = vi.fn().mockRejectedValue(networkError);

      await expect(fetchWithTimeout("https://example.com", {}, 5000)).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("formatSSEError", () => {
    /**
     * **Validates: Requirement 13.2**
     * Test SSE error event formatting
     */
    it("should format SSE error event correctly", () => {
      const result = formatSSEError("api_error", "Something went wrong");

      expect(result).toContain("event: error\n");
      expect(result).toContain("data: ");
      expect(result).toContain('"type":"error"');
      expect(result).toContain('"error":{');
      expect(result).toContain('"type":"api_error"');
      expect(result).toContain('"message":"Something went wrong"');
      expect(result.endsWith("\n\n")).toBe(true);
    });

    it("should format authentication error", () => {
      const result = formatSSEError("authentication_error", "Invalid token");

      expect(result).toContain('"type":"authentication_error"');
      expect(result).toContain('"message":"Invalid token"');
    });
  });

  describe("handleStreamingError", () => {
    /**
     * **Validates: Requirement 13.2**
     * Test network error handling during streaming
     */
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should write error event to stream", async () => {
      const writtenChunks: Uint8Array[] = [];
      const mockWriter = {
        write: vi.fn().mockImplementation((chunk: Uint8Array) => {
          writtenChunks.push(chunk);
          return Promise.resolve();
        }),
      } as unknown as WritableStreamDefaultWriter<Uint8Array>;

      const error = new Error("Network error");
      await handleStreamingError(mockWriter, error, "test-context");

      expect(mockWriter.write).toHaveBeenCalled();
      
      // Expect structured JSON logging
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Network error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"context":"test-context"')
      );

      // Verify SSE format
      const decoder = new TextDecoder();
      const written = decoder.decode(writtenChunks[0]);
      expect(written).toContain("event: error");
      expect(written).toContain("Network error");
    });

    it("should handle write failures gracefully", async () => {
      const mockWriter = {
        write: vi.fn().mockRejectedValue(new Error("Write failed")),
      } as unknown as WritableStreamDefaultWriter<Uint8Array>;

      const error = new Error("Original error");
      
      // Should not throw
      await expect(
        handleStreamingError(mockWriter, error)
      ).resolves.toBeUndefined();

      // Expect structured JSON logging for both errors
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Original error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Write failed"')
      );
    });

    it("should handle unknown error types", async () => {
      const mockWriter = {
        write: vi.fn().mockResolvedValue(undefined),
      } as unknown as WritableStreamDefaultWriter<Uint8Array>;

      await handleStreamingError(mockWriter, "string error");

      expect(mockWriter.write).toHaveBeenCalled();
      
      // Expect structured JSON logging
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"message":"string error"')
      );
    });
  });
});
