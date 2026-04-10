/**
 * Tests for structured logging utility
 * 
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logRequest,
  logTokenRefresh,
  logError,
  logStreamingCompletion,
  logCredentialFailover,
  LogLevel,
} from "./logger";

describe("Structured Logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirement 16.1**
   * Test request logging
   */
  describe("logRequest", () => {
    it("should log request with authentication status", () => {
      logRequest("POST", "/v1/messages", true, "req-123");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"type":"request"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"method":"POST"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"path":"/v1/messages"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"authenticated":true')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"requestId":"req-123"')
      );
    });

    it("should log unauthenticated requests", () => {
      logRequest("GET", "/v1/models", false);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"authenticated":false')
      );
    });
  });

  /**
   * **Validates: Requirement 16.2**
   * Test token refresh logging
   */
  describe("logTokenRefresh", () => {
    it("should log successful token refresh", () => {
      logTokenRefresh("cred-123", "success", 1);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"type":"token_refresh"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"credentialId":"cred-123"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"outcome":"success"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"attempt":1')
      );
    });

    it("should log failed token refresh with error", () => {
      logTokenRefresh("cred-456", "failure", 2, "Network timeout");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"outcome":"failure"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Network timeout"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"warn"')
      );
    });
  });

  /**
   * **Validates: Requirement 16.3**
   * Test error logging
   */
  describe("logError", () => {
    it("should log error with stack trace", () => {
      const error = new Error("Test error");
      logError(error, "test-context", "req-123", "cred-456");

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Test error"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"context":"test-context"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"requestId":"req-123"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"credentialId":"cred-456"')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"stack"')
      );
    });

    it("should handle non-Error objects", () => {
      logError("string error", "context");

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"error":"string error"')
      );
    });
  });

  /**
   * **Validates: Requirement 16.4**
   * Test streaming completion logging
   */
  describe("logStreamingCompletion", () => {
    it("should log streaming completion with token usage", () => {
      logStreamingCompletion(25, 100, 50, 10, "req-123", "cred-456");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"type":"streaming_completion"')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"eventCount":25')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"inputTokens":100')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"outputTokens":50')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"thinkingTokens":10')
      );
    });

    it("should log without optional fields", () => {
      logStreamingCompletion(10, 50, 25);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"eventCount":10')
      );
    });
  });

  /**
   * **Validates: Requirement 16.5**
   * Test credential failover logging
   */
  describe("logCredentialFailover", () => {
    it("should log credential failover with reason", () => {
      logCredentialFailover("cred-123", "cred-456", "max_failures_reached", 3);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"type":"credential_failover"')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"fromCredentialId":"cred-123"')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"toCredentialId":"cred-456"')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"reason":"max_failures_reached"')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"failureCount":3')
      );
    });

    it("should log when no credentials available", () => {
      logCredentialFailover("cred-123", null, "no_available_credentials", 5);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('"toCredentialId":null')
      );
    });
  });
});
