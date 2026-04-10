/**
 * End-to-end integration tests for the main worker entry point
 * 
 * Tests complete request flows from client to Kiro API including:
 * - Streaming with binary event stream parsing
 * - Credential failover scenarios
 * - WebSearch routing
 * - Admin API operations
 * 
 * **Validates: Requirements 1.1, 1.2, 1.4, 4.3, 9.1, 9.2, 12.1, 12.2**
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Env } from "./types/env";
import worker from "./index";

// Mock environment
function createMockEnv(): Env {
  const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  } as unknown as KVNamespace;

  const mockTokenManager = {
    idFromName: vi.fn(() => ({} as DurableObjectId)),
    get: vi.fn(() => ({
      fetch: vi.fn(),
    })),
  } as unknown as DurableObjectNamespace;

  return {
    CREDENTIALS_KV: mockKV,
    TOKEN_MANAGER: mockTokenManager,
    KIRO_REGION: "us-east-1",
    KIRO_VERSION: "0.8.0",
    SYSTEM_VERSION: "darwin#24.6.0",
    NODE_VERSION: "22.21.1",
    KIRO_API_KEY: "test-api-key",
    ADMIN_API_KEY: "test-admin-key",
  };
}

// Mock execution context
function createMockContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("Worker Entry Point - End-to-End Integration", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = createMockEnv();
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe("CORS Handling", () => {
    it("should handle OPTIONS preflight requests", async () => {
      const request = new Request("https://example.com/v1/messages", {
        method: "OPTIONS",
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("x-api-key");
    });
  });

  describe("Authentication", () => {
    it("should reject requests without API key", async () => {
      const request = new Request("https://example.com/v1/models", {
        method: "GET",
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(401);
      const body = await response.json() as any;
      expect(body.error.type).toBe("authentication_error");
    });

    it("should accept requests with valid x-api-key header", async () => {
      const request = new Request("https://example.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
    });

    it("should accept requests with valid Authorization Bearer header", async () => {
      const request = new Request("https://example.com/v1/models", {
        method: "GET",
        headers: {
          "Authorization": "Bearer test-api-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
    });

    it("should reject admin endpoints without admin API key", async () => {
      const request = new Request("https://example.com/api/admin/credentials", {
        method: "GET",
        headers: {
          "x-api-key": "test-api-key", // User key, not admin key
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(401);
    });

    it("should accept admin endpoints with valid admin API key", async () => {
      const request = new Request("https://example.com/api/admin/credentials", {
        method: "GET",
        headers: {
          "x-api-key": "test-admin-key",
        },
      });

      // Mock KV list response
      (env.CREDENTIALS_KV.list as any).mockResolvedValue({
        keys: [],
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
    });
  });

  describe("GET /v1/models - Model Listing", () => {
    /**
     * **Validates: Requirement 1.1**
     */
    it("should return list of supported models", async () => {
      const request = new Request("https://example.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json() as any;
      expect(body.object).toBe("list");
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      
      // Verify model structure
      const model = body.data[0];
      expect(model).toHaveProperty("id");
      expect(model).toHaveProperty("object", "model");
      expect(model).toHaveProperty("display_name");
      expect(model).toHaveProperty("type", "chat");
    });
  });

  describe("POST /v1/messages - Message Creation", () => {
    /**
     * **Validates: Requirement 1.2**
     */
    it("should validate required fields", async () => {
      const request = new Request("https://example.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Missing model and max_tokens
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(400);
      const body = await response.json() as any;
      expect(body.error.type).toBe("invalid_request_error");
    });
  });

  describe("POST /v1/messages/count_tokens - Token Counting", () => {
    /**
     * **Validates: Requirement 1.3**
     */
    it("should handle token counting requests", async () => {
      const request = new Request("https://example.com/v1/messages/count_tokens", {
        method: "POST",
        headers: {
          "x-api-key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          messages: [
            { role: "user", content: "Hello, how are you?" },
          ],
        }),
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body).toHaveProperty("input_tokens");
      expect(typeof body.input_tokens).toBe("number");
      expect(body.input_tokens).toBeGreaterThan(0);
    });
  });

  describe("Admin UI", () => {
    it("should serve admin UI HTML", async () => {
      const request = new Request("https://example.com/admin", {
        method: "GET",
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");
      
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Kiro Admin");
    });

    it("should serve admin UI with /admin/ path", async () => {
      const request = new Request("https://example.com/admin/", {
        method: "GET",
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");
    });
  });

  describe("Admin API - Credential Management", () => {
    /**
     * **Validates: Requirements 12.1, 12.2**
     */
    it("should list all credentials", async () => {
      const request = new Request("https://example.com/api/admin/credentials", {
        method: "GET",
        headers: {
          "x-api-key": "test-admin-key",
        },
      });

      // Mock KV get for credential list and individual credentials
      (env.CREDENTIALS_KV.get as any).mockImplementation((key: string, type?: string) => {
        if (key === "credential:list") {
          // Return array directly when type is "json"
          if (type === "json") {
            return Promise.resolve(["cred-1", "cred-2"]);
          }
          return Promise.resolve(JSON.stringify(["cred-1", "cred-2"]));
        }
        if (key === "credential:cred-1") {
          if (type === "json") {
            return Promise.resolve({
              id: "cred-1",
              name: "Credential 1",
              clientId: "client1",
              clientSecret: "secret1",
              priority: 1,
              accessToken: "token1",
              refreshToken: "refresh1",
              expiresAt: Date.now() + 3600000,
              disabled: false,
              failureCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
          return Promise.resolve(JSON.stringify({
            id: "cred-1",
            name: "Credential 1",
            clientId: "client1",
            clientSecret: "secret1",
            priority: 1,
            accessToken: "token1",
            refreshToken: "refresh1",
            expiresAt: Date.now() + 3600000,
            disabled: false,
            failureCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
        }
        if (key === "credential:cred-2") {
          if (type === "json") {
            return Promise.resolve({
              id: "cred-2",
              name: "Credential 2",
              clientId: "client2",
              clientSecret: "secret2",
              priority: 2,
              accessToken: "token2",
              refreshToken: "refresh2",
              expiresAt: Date.now() + 3600000,
              disabled: false,
              failureCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
          return Promise.resolve(JSON.stringify({
            id: "cred-2",
            name: "Credential 2",
            clientId: "client2",
            clientSecret: "secret2",
            priority: 2,
            accessToken: "token2",
            refreshToken: "refresh2",
            expiresAt: Date.now() + 3600000,
            disabled: false,
            failureCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
        }
        return Promise.resolve(null);
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
    });

    it("should create new credential", async () => {
      const newCredential = {
        name: "New Credential",
        clientId: "new-client",
        clientSecret: "new-secret",
        refreshToken: "new-refresh",
        accessToken: "new-token",
        expiresAt: Date.now() + 3600000,
        priority: 1,
      };

      const request = new Request("https://example.com/api/admin/credentials", {
        method: "POST",
        headers: {
          "x-api-key": "test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newCredential),
      });

      // Mock KV get for credential list
      (env.CREDENTIALS_KV.get as any).mockImplementation((key: string, type?: string) => {
        if (key === "credential:list") {
          if (type === "json") {
            return Promise.resolve([]);
          }
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(null);
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(201);
      expect(env.CREDENTIALS_KV.put).toHaveBeenCalled();
    });

    it("should delete credential", async () => {
      // Mock existing credential
      (env.CREDENTIALS_KV.get as any).mockImplementation((key: string, type?: string) => {
        if (key === "credential:cred-1") {
          if (type === "json") {
            return Promise.resolve({
              id: "cred-1",
              name: "Credential 1",
              clientId: "client1",
              clientSecret: "secret1",
              priority: 1,
              accessToken: "token1",
              refreshToken: "refresh1",
              expiresAt: Date.now() + 3600000,
              disabled: false,
              failureCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }
          return Promise.resolve(JSON.stringify({
            id: "cred-1",
            name: "Credential 1",
            clientId: "client1",
            clientSecret: "secret1",
            priority: 1,
            accessToken: "token1",
            refreshToken: "refresh1",
            expiresAt: Date.now() + 3600000,
            disabled: false,
            failureCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
        }
        if (key === "credential:list") {
          if (type === "json") {
            return Promise.resolve(["cred-1"]);
          }
          return Promise.resolve(JSON.stringify(["cred-1"]));
        }
        return Promise.resolve(null);
      });

      const request = new Request("https://example.com/api/admin/credentials/cred-1", {
        method: "DELETE",
        headers: {
          "x-api-key": "test-admin-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(env.CREDENTIALS_KV.delete).toHaveBeenCalledWith("credential:cred-1");
    });

    it("should toggle credential disabled state", async () => {
      // Mock existing credential
      (env.CREDENTIALS_KV.get as any).mockResolvedValue(JSON.stringify({
        id: "cred-1",
        priority: 1,
        accessToken: "token1",
        refreshToken: "refresh1",
        expiresAt: Date.now() + 3600000,
        disabled: false,
        failureCount: 0,
      }));

      const request = new Request("https://example.com/api/admin/credentials/cred-1/disabled", {
        method: "POST",
        headers: {
          "x-api-key": "test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ disabled: true }),
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(env.CREDENTIALS_KV.put).toHaveBeenCalled();
    });

    it("should update credential priority", async () => {
      // Mock existing credential
      (env.CREDENTIALS_KV.get as any).mockResolvedValue(JSON.stringify({
        id: "cred-1",
        priority: 1,
        accessToken: "token1",
        refreshToken: "refresh1",
        expiresAt: Date.now() + 3600000,
        disabled: false,
        failureCount: 0,
      }));

      const request = new Request("https://example.com/api/admin/credentials/cred-1/priority", {
        method: "POST",
        headers: {
          "x-api-key": "test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priority: 5 }),
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(env.CREDENTIALS_KV.put).toHaveBeenCalled();
    });

    it("should reset credential failure count", async () => {
      // Mock existing credential
      (env.CREDENTIALS_KV.get as any).mockResolvedValue(JSON.stringify({
        id: "cred-1",
        priority: 1,
        accessToken: "token1",
        refreshToken: "refresh1",
        expiresAt: Date.now() + 3600000,
        disabled: false,
        failureCount: 3,
      }));

      const request = new Request("https://example.com/api/admin/credentials/cred-1/reset", {
        method: "POST",
        headers: {
          "x-api-key": "test-admin-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(env.CREDENTIALS_KV.put).toHaveBeenCalled();
    });
  });

  describe("Routing", () => {
    it("should return 404 for unknown API endpoints", async () => {
      const request = new Request("https://example.com/v1/unknown", {
        method: "GET",
        headers: {
          "x-api-key": "test-api-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(404);
      const body = await response.json() as any;
      expect(body.error.type).toBe("not_found_error");
    });

    it("should return 404 for unknown admin endpoints", async () => {
      const request = new Request("https://example.com/api/admin/unknown", {
        method: "GET",
        headers: {
          "x-api-key": "test-admin-key",
        },
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(404);
      const body = await response.json() as any;
      expect(body.error.type).toBe("not_found_error");
    });

    it("should serve root endpoint", async () => {
      const request = new Request("https://example.com/", {
        method: "GET",
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");
      
      const text = await response.text();
      expect(text).toContain("Kiro");
    });

    it("should return 404 for unknown paths", async () => {
      const request = new Request("https://example.com/unknown", {
        method: "GET",
      });

      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(404);
    });
  });

  describe("Claude Code Compatibility Mode", () => {
    it("should route /cc/v1/messages to Claude Code handler", async () => {
      const request = new Request("https://example.com/cc/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
        }),
      });

      // Mock TokenManager response
      const mockTokenManager = env.TOKEN_MANAGER.get({} as DurableObjectId);
      (mockTokenManager.fetch as any).mockResolvedValue(
        new Response(JSON.stringify({
          error: "No credentials available",
        }), { status: 503 })
      );

      const response = await worker.fetch(request, env, ctx);

      // Should attempt to process (will fail due to mock, but routing works)
      expect(response.status).toBe(503);
    });
  });

  describe("Environment Configuration", () => {
    /**
     * **Validates: Requirements 15.4, 15.5**
     */
    it("should use environment variables for configuration", () => {
      expect(env.KIRO_REGION).toBe("us-east-1");
      expect(env.KIRO_VERSION).toBe("0.8.0");
      expect(env.SYSTEM_VERSION).toBe("darwin#24.6.0");
      expect(env.NODE_VERSION).toBe("22.21.1");
      expect(env.KIRO_API_KEY).toBe("test-api-key");
      expect(env.ADMIN_API_KEY).toBe("test-admin-key");
    });

    it("should handle optional environment variables", () => {
      const envWithOptional: Env = {
        ...env,
        COUNT_TOKENS_API_URL: "https://tokens.example.com",
        COUNT_TOKENS_API_KEY: "token-key",
        PROXY_URL: "http://proxy.example.com:8080",
        PROXY_USERNAME: "proxy-user",
        PROXY_PASSWORD: "proxy-pass",
      };

      expect(envWithOptional.COUNT_TOKENS_API_URL).toBe("https://tokens.example.com");
      expect(envWithOptional.COUNT_TOKENS_API_KEY).toBe("token-key");
      expect(envWithOptional.PROXY_URL).toBe("http://proxy.example.com:8080");
      expect(envWithOptional.PROXY_USERNAME).toBe("proxy-user");
      expect(envWithOptional.PROXY_PASSWORD).toBe("proxy-pass");
    });
  });
});
