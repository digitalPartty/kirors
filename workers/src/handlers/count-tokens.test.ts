/**
 * Unit tests for token counting endpoint
 * 
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleCountTokens } from "./count-tokens";
import type { Env } from "../types/env";
import type { CountTokensRequest } from "../types/anthropic";

// Mock environment
const createMockEnv = (overrides?: Partial<Env>): Env => ({
  CREDENTIALS_KV: {} as KVNamespace,
  TOKEN_MANAGER: {} as any,
  KIRO_REGION: "us-east-1",
  KIRO_VERSION: "0.8.0",
  SYSTEM_VERSION: "darwin#24.6.0",
  NODE_VERSION: "22.21.1",
  ...overrides,
});

describe("handleCountTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("Request validation", () => {
    it("should return 400 when model is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("model");
    });

    it("should return 400 when messages are missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
        }),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("messages");
    });

    it("should return 400 when messages array is empty", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          messages: [],
        }),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("messages");
    });
  });

  describe("External API integration", () => {
    it("should forward request to external API when configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ input_tokens: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      global.fetch = mockFetch;

      const env = createMockEnv({
        COUNT_TOKENS_API_URL: "https://token-counter.example.com/count",
        COUNT_TOKENS_API_KEY: "test-api-key",
        COUNT_TOKENS_AUTH_TYPE: "x-api-key",
      });

      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello, world!" }],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBe(42);

      // Verify external API was called
      expect(mockFetch).toHaveBeenCalledWith(
        "https://token-counter.example.com/count",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": "test-api-key",
          }),
          body: JSON.stringify(requestBody),
        })
      );
    });

    it("should use bearer auth when configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ input_tokens: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      global.fetch = mockFetch;

      const env = createMockEnv({
        COUNT_TOKENS_API_URL: "https://token-counter.example.com/count",
        COUNT_TOKENS_API_KEY: "test-bearer-token",
        COUNT_TOKENS_AUTH_TYPE: "bearer",
      });

      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello" }],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      await handleCountTokens(request, env);

      // Verify bearer auth was used
      expect(mockFetch).toHaveBeenCalledWith(
        "https://token-counter.example.com/count",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Authorization": "Bearer test-bearer-token",
          }),
        })
      );
    });

    it("should fall back to estimation when external API returns error", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
        })
      );
      global.fetch = mockFetch;

      const env = createMockEnv({
        COUNT_TOKENS_API_URL: "https://token-counter.example.com/count",
        COUNT_TOKENS_API_KEY: "test-api-key",
      });

      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello, world!" }],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Should return estimated count (not 42 from external API)
      expect(body.input_tokens).toBeGreaterThan(0);
      expect(body.input_tokens).not.toBe(42);
    });

    it("should fall back to estimation when external API throws error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const env = createMockEnv({
        COUNT_TOKENS_API_URL: "https://token-counter.example.com/count",
        COUNT_TOKENS_API_KEY: "test-api-key",
      });

      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello, world!" }],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBeGreaterThan(0);
    });
  });

  describe("Fallback estimation algorithm", () => {
    it("should estimate tokens for simple text message", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello, world!" }],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      // "Hello, world!" is 13 characters, so ~4 tokens
      expect(body.input_tokens).toBeGreaterThan(0);
      expect(body.input_tokens).toBeLessThan(10);
    });

    it("should include system prompt in token count", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello" }],
        system: "You are a helpful assistant.",
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Should include both message and system prompt
      expect(body.input_tokens).toBeGreaterThan(5);
    });

    it("should include system prompt array in token count", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello" }],
        system: [
          { text: "You are a helpful assistant." },
          { text: "Always be polite." },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBeGreaterThan(10);
    });

    it("should include tools in token count", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather for a location",
            input_schema: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
            },
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Should include message and tool definition
      expect(body.input_tokens).toBeGreaterThan(10);
    });

    it("should handle content blocks with text", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hello" },
              { type: "text", text: "World" },
            ],
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBeGreaterThan(0);
    });

    it("should handle content blocks with thinking", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Let me think about this..." },
              { type: "text", text: "The answer is 42" },
            ],
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBeGreaterThan(5);
    });

    it("should handle tool use content blocks", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool_123",
                name: "get_weather",
                input: { location: "San Francisco" },
              },
            ],
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBeGreaterThan(0);
    });

    it("should handle tool result content blocks", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool_123",
                content: { temperature: 72, conditions: "sunny" },
              },
            ],
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.input_tokens).toBeGreaterThan(0);
    });

    it("should handle complex request with all components", async () => {
      const env = createMockEnv();
      const requestBody: CountTokensRequest = {
        model: "claude-3-5-sonnet-20241022",
        system: "You are a helpful assistant.",
        messages: [
          { role: "user", content: "What's the weather?" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool_123",
                name: "get_weather",
                input: { location: "San Francisco" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool_123",
                content: { temperature: 72 },
              },
            ],
          },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: { type: "object" },
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Should include all components
      expect(body.input_tokens).toBeGreaterThan(20);
    });
  });

  describe("Error handling", () => {
    it("should return 500 when request body is invalid JSON", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages/count_tokens", {
        method: "POST",
        body: "invalid json",
      });

      const response = await handleCountTokens(request, env);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error.type).toBe("api_error");
    });
  });
});
