/**
 * Integration tests for /v1/messages endpoint
 * 
 * Tests both streaming and non-streaming message handling with mocked
 * Kiro API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleMessages } from "./messages";
import type { Env } from "../types/env";
import type { MessagesRequest } from "../types/anthropic";

// Mock environment
const createMockEnv = (): Env => {
  const mockTokenManager = {
    fetch: vi.fn(),
  };

  const mockDurableObjectNamespace = {
    idFromName: vi.fn(() => "mock-id"),
    get: vi.fn(() => mockTokenManager),
    newUniqueId: vi.fn(),
    idFromString: vi.fn(),
  };

  return {
    CREDENTIALS_KV: {} as KVNamespace,
    TOKEN_MANAGER: mockDurableObjectNamespace as any,
    KIRO_REGION: "us-east-1",
    KIRO_VERSION: "0.8.0",
    SYSTEM_VERSION: "darwin#24.6.0",
    NODE_VERSION: "22.21.1",
  };
};

// Mock fetch globally
const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("handleMessages", () => {
  describe("validation", () => {
    it("should return 400 if model is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("model");
    });

    it("should return 400 if max_tokens is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("max_tokens");
    });

    it("should return 400 if messages is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
        }),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("messages");
    });
  });

  describe("non-streaming", () => {
    it("should handle successful non-streaming request", async () => {
      const env = createMockEnv();
      
      // Mock TokenManager responses
      const mockTokenManager = (env.TOKEN_MANAGER as any).get();
      mockTokenManager.fetch.mockImplementation(async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === "/acquireContext") {
          return new Response(JSON.stringify({
            id: "cred-123",
            accessToken: "mock-token",
            credentials: {
              id: "cred-123",
              name: "Test Credential",
              accessToken: "mock-token",
            },
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname === "/reportSuccess") {
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      });

      // Mock Kiro API response with binary event stream
      global.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        if (urlStr.includes("generateAssistantResponse")) {
          // Create mock binary event stream
          const events = [
            createMockFrame("assistantResponseEvent", {
              messageStart: {
                conversationId: "conv-123",
                messageId: "msg-123",
                role: "assistant",
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockStart: {
                blockIndex: 0,
                contentBlock: {
                  type: "text",
                  text: "",
                },
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockDelta: {
                blockIndex: 0,
                delta: {
                  type: "text",
                  text: "Hello! How can I help you today?",
                },
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockStop: {
                blockIndex: 0,
              },
            }),
            createMockFrame("contextUsageEvent", {
              inputTokens: 10,
              outputTokens: 8,
            }),
            createMockFrame("assistantResponseEvent", {
              messageStop: {
                stopReason: "end_turn",
              },
            }),
          ];

          const stream = new ReadableStream({
            start(controller) {
              for (const event of events) {
                controller.enqueue(event);
              }
              controller.close();
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        
        return new Response("Not Found", { status: 404 });
      }) as any;

      const requestBody: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      };

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      
      const body = await response.json();
      expect(body.type).toBe("message");
      expect(body.role).toBe("assistant");
      expect(body.content).toHaveLength(1);
      expect(body.content[0].type).toBe("text");
      expect(body.content[0].text).toBe("Hello! How can I help you today?");
      expect(body.usage.input_tokens).toBe(10);
      expect(body.usage.output_tokens).toBe(8);
      expect(body.stop_reason).toBe("end_turn");
    });

    it("should handle upstream API error", async () => {
      const env = createMockEnv();
      
      // Mock TokenManager responses
      const mockTokenManager = (env.TOKEN_MANAGER as any).get();
      mockTokenManager.fetch.mockImplementation(async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === "/acquireContext") {
          return new Response(JSON.stringify({
            id: "cred-123",
            accessToken: "mock-token",
            credentials: { id: "cred-123" },
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname === "/reportFailure") {
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      });

      // Mock Kiro API error response
      global.fetch = vi.fn(async () => {
        return new Response("Unauthorized", { status: 401 });
      }) as any;

      const requestBody: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      };

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(401);
      
      const body = await response.json();
      expect(body.error.type).toBe("authentication_error");
    });
  });

  describe("WebSearch routing", () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.5**
     * Test that WebSearch requests are routed to MCP API
     */
    it("should route WebSearch request to MCP API endpoint", async () => {
      const env = createMockEnv();
      
      // Mock TokenManager responses
      const mockTokenManager = (env.TOKEN_MANAGER as any).get();
      mockTokenManager.fetch.mockImplementation(async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === "/acquireContext") {
          return new Response(JSON.stringify({
            id: "cred-123",
            accessToken: "mock-token",
            credentials: { id: "cred-123" },
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      });

      // Mock MCP API response
      global.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        if (urlStr.includes("mcp.kiro")) {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: "rpc-123",
            result: {
              content: [
                {
                  type: "text",
                  text: "Search results for Cloudflare Workers",
                },
              ],
            },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        return new Response("Not Found", { status: 404 });
      }) as any;

      const requestBody: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_use",
                id: "tool-123",
                name: "web_search",
                input: {
                  query: "Cloudflare Workers",
                },
              },
            ],
          },
        ],
        tools: [
          {
            name: "web_search",
            description: "Search the web",
          },
        ],
      };

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.type).toBe("message");
      expect(body.role).toBe("assistant");
      expect(body.content).toHaveLength(1);
      expect(body.content[0].type).toBe("tool_result");
      
      // Verify MCP API was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("mcp.kiro"),
        expect.any(Object)
      );
    });

    it("should use standard Kiro API for non-WebSearch tools", async () => {
      const env = createMockEnv();
      
      // Mock TokenManager responses
      const mockTokenManager = (env.TOKEN_MANAGER as any).get();
      mockTokenManager.fetch.mockImplementation(async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === "/acquireContext") {
          return new Response(JSON.stringify({
            id: "cred-123",
            accessToken: "mock-token",
            credentials: { id: "cred-123" },
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname === "/reportSuccess") {
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      });

      // Mock Kiro API response
      global.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        if (urlStr.includes("generateAssistantResponse")) {
          const events = [
            createMockFrame("assistantResponseEvent", {
              messageStart: {
                conversationId: "conv-123",
                messageId: "msg-123",
                role: "assistant",
              },
            }),
            createMockFrame("assistantResponseEvent", {
              messageStop: {
                stopReason: "end_turn",
              },
            }),
          ];

          const stream = new ReadableStream({
            start(controller) {
              for (const event of events) {
                controller.enqueue(event);
              }
              controller.close();
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        
        return new Response("Not Found", { status: 404 });
      }) as any;

      const requestBody: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            name: "calculator",
            description: "Perform calculations",
          },
        ],
        stream: false,
      };

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(200);
      
      // Verify standard Kiro API was called, not MCP API
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("generateAssistantResponse"),
        expect.any(Object)
      );
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining("mcp.kiro"),
        expect.any(Object)
      );
    });
  });

  describe("streaming", () => {
    it("should handle successful streaming request", async () => {
      const env = createMockEnv();
      
      // Mock TokenManager responses
      const mockTokenManager = (env.TOKEN_MANAGER as any).get();
      mockTokenManager.fetch.mockImplementation(async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === "/acquireContext") {
          return new Response(JSON.stringify({
            id: "cred-123",
            accessToken: "mock-token",
            credentials: { id: "cred-123" },
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname === "/reportSuccess") {
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      });

      // Mock Kiro API response with binary event stream
      global.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        
        if (urlStr.includes("generateAssistantResponse")) {
          const events = [
            createMockFrame("assistantResponseEvent", {
              messageStart: {
                conversationId: "conv-123",
                messageId: "msg-123",
                role: "assistant",
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockStart: {
                blockIndex: 0,
                contentBlock: {
                  type: "text",
                  text: "",
                },
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockDelta: {
                blockIndex: 0,
                delta: {
                  type: "text",
                  text: "Hello!",
                },
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockStop: {
                blockIndex: 0,
              },
            }),
            createMockFrame("assistantResponseEvent", {
              messageStop: {
                stopReason: "end_turn",
              },
            }),
          ];

          const stream = new ReadableStream({
            start(controller) {
              for (const event of events) {
                controller.enqueue(event);
              }
              controller.close();
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        
        return new Response("Not Found", { status: 404 });
      }) as any;

      const requestBody: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      const request = new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleMessages(request, env);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      
      // Read SSE stream
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      
      if (reader) {
        const decoder = new TextDecoder();
        let sseData = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseData += decoder.decode(value, { stream: true });
        }
        
        // Verify SSE events are present
        expect(sseData).toContain("event: message_start");
        expect(sseData).toContain("event: content_block_start");
        expect(sseData).toContain("event: content_block_delta");
        expect(sseData).toContain("event: content_block_stop");
        expect(sseData).toContain("event: message_stop");
      }
    });
  });
});

/**
 * Calculate CRC32 checksum (ISO-HDLC standard)
 */
function crc32(data: Uint8Array): number {
  const CRC32_TABLE = new Uint32Array(256);
  
  // Initialize CRC32 lookup table
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    CRC32_TABLE[i] = crc;
  }
  
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Create a mock AWS Event Stream frame with proper CRC checksums
 */
function createMockFrame(eventType: string, payload: any): Uint8Array {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadLength = payloadBytes.length;
  
  const headerName = ":event-type";
  const headerValue = eventType;
  const headerNameBytes = new TextEncoder().encode(headerName);
  const headerValueBytes = new TextEncoder().encode(headerValue);
  
  // Calculate sizes
  const headerLength = 1 + headerNameBytes.length + 1 + 2 + headerValueBytes.length;
  const totalLength = 16 + headerLength + payloadLength;
  
  // Create buffer
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  
  let offset = 0;
  
  // Total length (4 bytes)
  view.setUint32(offset, totalLength, false);
  offset += 4;
  
  // Headers length (4 bytes)
  view.setUint32(offset, headerLength, false);
  offset += 4;
  
  // Calculate prelude CRC (first 8 bytes)
  const preludeCrc = crc32(uint8.subarray(0, 8));
  view.setUint32(offset, preludeCrc, false);
  offset += 4;
  
  // Header: name length (1 byte)
  view.setUint8(offset, headerNameBytes.length);
  offset += 1;
  
  // Header: name
  uint8.set(headerNameBytes, offset);
  offset += headerNameBytes.length;
  
  // Header: type (1 byte) - 7 = string
  view.setUint8(offset, 7);
  offset += 1;
  
  // Header: value length (2 bytes)
  view.setUint16(offset, headerValueBytes.length, false);
  offset += 2;
  
  // Header: value
  uint8.set(headerValueBytes, offset);
  offset += headerValueBytes.length;
  
  // Payload
  uint8.set(payloadBytes, offset);
  offset += payloadLength;
  
  // Calculate message CRC (everything except the last 4 bytes)
  const messageCrc = crc32(uint8.subarray(0, totalLength - 4));
  view.setUint32(offset, messageCrc, false);
  
  return uint8;
}
