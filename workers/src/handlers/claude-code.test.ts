/**
 * Unit tests for Claude Code compatibility mode handler
 * 
 * Tests buffered streaming, token count extraction, and ping events.
 * 
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleClaudeCodeMessages } from "./claude-code";
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

describe("handleClaudeCodeMessages", () => {
  describe("validation", () => {
    /**
     * **Validates: Requirement 20.1**
     * Test that non-streaming requests are rejected
     */
    it("should return 400 if stream is not true", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        }),
      });

      const response = await handleClaudeCodeMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("stream: true");
    });

    it("should return 400 if model is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
        }),
      });

      const response = await handleClaudeCodeMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("model");
    });

    it("should return 400 if max_tokens is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
        }),
      });

      const response = await handleClaudeCodeMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("max_tokens");
    });

    it("should return 400 if messages is missing", async () => {
      const env = createMockEnv();
      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          stream: true,
        }),
      });

      const response = await handleClaudeCodeMessages(request, env);
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("messages");
    });
  });

  describe("buffered streaming", () => {
    /**
     * **Validates: Requirements 20.1, 20.2, 20.3**
     * Test that events are buffered and token counts are updated
     */
    it("should buffer all events and update message_start with accurate input_tokens", async () => {
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
            // contextUsageEvent with accurate token counts
            createMockFrame("contextUsageEvent", {
              inputTokens: 42,
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
        stream: true,
      };

      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleClaudeCodeMessages(request, env);
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
        
        // Extract and verify message_start event has accurate input_tokens
        const messageStartMatch = sseData.match(/event: message_start\ndata: ({.*?})\n\n/s);
        expect(messageStartMatch).toBeTruthy();
        
        if (messageStartMatch) {
          const messageStartData = JSON.parse(messageStartMatch[1]);
          expect(messageStartData.message.usage.input_tokens).toBe(42);
        }
      }
    });

    /**
     * **Validates: Requirement 20.3**
     * Test that events are sent in correct order after buffering
     */
    it("should send buffered events in correct order", async () => {
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
                  text: "First",
                },
              },
            }),
            createMockFrame("assistantResponseEvent", {
              contentBlockDelta: {
                blockIndex: 0,
                delta: {
                  type: "text",
                  text: " Second",
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
              outputTokens: 5,
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

      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleClaudeCodeMessages(request, env);
      
      // Read SSE stream
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let sseData = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseData += decoder.decode(value, { stream: true });
        }
        
        // Extract event types in order
        const eventMatches = Array.from(sseData.matchAll(/event: (\w+)/g));
        const eventTypes = eventMatches.map(match => match[1]);
        
        // Verify correct order (excluding ping events)
        const nonPingEvents = eventTypes.filter(type => type !== "ping");
        expect(nonPingEvents[0]).toBe("message_start");
        expect(nonPingEvents[1]).toBe("content_block_start");
        expect(nonPingEvents[2]).toBe("content_block_delta");
        expect(nonPingEvents[3]).toBe("content_block_delta");
        expect(nonPingEvents[4]).toBe("content_block_stop");
        expect(nonPingEvents[nonPingEvents.length - 2]).toBe("message_delta");
        expect(nonPingEvents[nonPingEvents.length - 1]).toBe("message_stop");
      }
    });
  });

  describe("ping events", () => {
    /**
     * **Validates: Requirement 20.4**
     * Test that ping events are emitted during buffering
     */
    it("should emit ping events every 25 seconds during buffering", async () => {
      vi.useFakeTimers();
      
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

      // Mock Kiro API response with delayed stream
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
            createMockFrame("contextUsageEvent", {
              inputTokens: 10,
              outputTokens: 5,
            }),
            createMockFrame("assistantResponseEvent", {
              messageStop: {
                stopReason: "end_turn",
              },
            }),
          ];

          // Create a stream that delays before sending events
          const stream = new ReadableStream({
            async start(controller) {
              // Send first event
              controller.enqueue(events[0]);
              
              // Wait 60 seconds (should trigger 2 ping events)
              await new Promise(resolve => {
                setTimeout(() => {
                  controller.enqueue(events[1]);
                  controller.enqueue(events[2]);
                  controller.close();
                  resolve(undefined);
                }, 60000);
              });
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

      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const responsePromise = handleClaudeCodeMessages(request, env);
      
      // Advance timers to trigger ping events
      await vi.advanceTimersByTimeAsync(25000); // First ping
      await vi.advanceTimersByTimeAsync(25000); // Second ping
      await vi.advanceTimersByTimeAsync(10000); // Complete stream
      
      const response = await responsePromise;
      
      // Read SSE stream
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let sseData = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseData += decoder.decode(value, { stream: true });
        }
        
        // Count ping events
        const pingMatches = Array.from(sseData.matchAll(/event: ping/g));
        expect(pingMatches.length).toBeGreaterThanOrEqual(1);
      }
      
      vi.useRealTimers();
    }, 10000);
  });

  describe("error handling", () => {
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
        stream: true,
      };

      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleClaudeCodeMessages(request, env);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      
      // Read SSE stream
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let sseData = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseData += decoder.decode(value, { stream: true });
        }
        
        // Verify error event is present
        expect(sseData).toContain("event: error");
        expect(sseData).toContain("authentication_error");
      }
    });

    it("should handle credential acquisition failure", async () => {
      const env = createMockEnv();
      
      // Mock TokenManager to fail
      const mockTokenManager = (env.TOKEN_MANAGER as any).get();
      mockTokenManager.fetch.mockImplementation(async () => {
        return new Response(JSON.stringify({ error: "No credentials available" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      });

      const requestBody: MessagesRequest = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      const request = new Request("http://localhost/cc/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleClaudeCodeMessages(request, env);
      expect(response.status).toBe(503);
      
      const body = await response.json();
      expect(body.error.type).toBe("overloaded_error");
      expect(body.error.message).toContain("No available credentials");
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
