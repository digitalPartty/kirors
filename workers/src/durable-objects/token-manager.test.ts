/**
 * TokenManager Durable Object Tests
 * 
 * Unit tests for the TokenManager Durable Object implementation.
 * Tests credential selection by priority, token expiry detection and refresh,
 * failover logic when credentials fail, and failure count reset on success.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4**
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { TokenManager } from "./token-manager";
import type { Credential, CallContext } from "../types/kiro";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "../types/env";

// Helper to create mock credentials
const createMockCredential = (overrides: Partial<Credential> = {}): Credential => ({
  id: "test-id-1",
  name: "Test Credential",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
  accessToken: "test-access-token",
  expiresAt: Date.now() + 3600000, // 1 hour from now
  priority: 0,
  disabled: false,
  failureCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe("TokenManager", () => {
  let storageData: Map<string, unknown>;
  let kvData: Map<string, string>;
  let mockState: DurableObjectState;
  let mockEnv: Env;
  let tokenManager: TokenManager;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset storage
    storageData = new Map();
    kvData = new Map();

    // Mock Durable Object state
    mockState = {
      storage: {
        get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
          return storageData.get(key) as T | undefined;
        }),
        put: vi.fn(async (key: string, value: unknown): Promise<void> => {
          storageData.set(key, value);
        }),
        delete: vi.fn(async (key: string): Promise<void> => {
          storageData.delete(key);
        }),
        list: vi.fn(),
        deleteAll: vi.fn(),
        transaction: vi.fn(),
        getAlarm: vi.fn(),
        setAlarm: vi.fn(),
        deleteAlarm: vi.fn(),
        sync: vi.fn(),
      } as unknown as DurableObjectStorage,
      id: {} as DurableObjectId,
      waitUntil: vi.fn(),
      blockConcurrencyWhile: vi.fn(),
    };

    // Mock KV namespace
    const mockKV = {
      get: vi.fn(async <T>(key: string, type?: string): Promise<T | null> => {
        const value = kvData.get(key);
        if (!value) return null;
        if (type === "json") {
          return JSON.parse(value) as T;
        }
        return value as T;
      }),
      put: vi.fn(async (key: string, value: string): Promise<void> => {
        kvData.set(key, value);
      }),
      delete: vi.fn(async (key: string): Promise<void> => {
        kvData.delete(key);
      }),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;

    mockEnv = {
      CREDENTIALS_KV: mockKV,
      KIRO_REGION: "us-east-1",
    } as Env;

    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    tokenManager = new TokenManager(mockState, mockEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Credential Selection by Priority", () => {
    it("should select highest priority credential", async () => {
      // **Validates: Requirements 4.1, 4.2**
      const cred1 = createMockCredential({ id: "cred-1", priority: 10 });
      const cred2 = createMockCredential({ id: "cred-2", priority: 20 });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      const context = await tokenManager.acquireContext();

      expect(context.id).toBe("cred-2");
      expect(context.accessToken).toBe(cred2.accessToken);
    });

    it("should skip disabled credentials and select next by priority", async () => {
      // **Validates: Requirements 4.2, 4.3**
      const cred1 = createMockCredential({ id: "cred-1", priority: 20, disabled: true });
      const cred2 = createMockCredential({ id: "cred-2", priority: 10, disabled: false });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      const context = await tokenManager.acquireContext();

      expect(context.id).toBe("cred-2");
    });

    it("should select credential with lower failure count when priorities are equal", async () => {
      // **Validates: Requirements 4.2**
      const cred1 = createMockCredential({ id: "cred-1", priority: 10 });
      const cred2 = createMockCredential({ id: "cred-2", priority: 10 });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      // Set failure counts
      storageData.set("failureCounts", { "cred-1": 2, "cred-2": 0 });

      const context = await tokenManager.acquireContext();

      expect(context.id).toBe("cred-2");
    });

    it("should throw error when no credentials are configured", async () => {
      // **Validates: Requirements 4.2**
      kvData.clear();

      await expect(tokenManager.acquireContext()).rejects.toThrow("No credentials configured");
    });

    it("should throw error when all credentials are disabled", async () => {
      // **Validates: Requirements 4.2, 4.3**
      const cred1 = createMockCredential({ id: "cred-1", disabled: true });
      const cred2 = createMockCredential({ id: "cred-2", disabled: true });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      await expect(tokenManager.acquireContext()).rejects.toThrow(
        "No available credentials (all disabled)"
      );
    });
  });

  describe("Token Expiry Detection and Refresh", () => {
    it("should detect expired tokens within buffer window", async () => {
      // **Validates: Requirements 3.1**
      const expiredCred = createMockCredential({
        id: "cred-1",
        expiresAt: Date.now() + 4 * 60 * 1000, // Expires in 4 minutes (within 5 min buffer)
      });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(expiredCred));

      // Mock successful token refresh
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        }),
      });

      const context = await tokenManager.acquireContext();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refresh_token: expiredCred.refreshToken }),
        })
      );
      expect(context.accessToken).toBe("new-access-token");
    });

    it("should refresh token when expiring within threshold", async () => {
      // **Validates: Requirements 3.1, 3.2**
      const expiringSoonCred = createMockCredential({
        id: "cred-1",
        expiresAt: Date.now() + 8 * 60 * 1000, // Expires in 8 minutes (within 10 min threshold)
      });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(expiringSoonCred));

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "refreshed-token",
          expires_in: 3600,
        }),
      });

      const context = await tokenManager.acquireContext();

      expect(context.accessToken).toBe("refreshed-token");
    });

    it("should not refresh token when not expiring soon", async () => {
      // **Validates: Requirements 3.1**
      const validCred = createMockCredential({
        id: "cred-1",
        expiresAt: Date.now() + 30 * 60 * 1000, // Expires in 30 minutes
      });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(validCred));

      const context = await tokenManager.acquireContext();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(context.accessToken).toBe(validCred.accessToken);
    });

    it("should update credential in KV after successful refresh", async () => {
      // **Validates: Requirements 3.2**
      const cred = createMockCredential({
        id: "cred-1",
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      const newAccessToken = "new-access-token";
      const newRefreshToken = "new-refresh-token";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_in: 3600,
        }),
      });

      await tokenManager.acquireContext();

      const updatedCred = JSON.parse(kvData.get("credential:cred-1")!) as Credential;
      expect(updatedCred.accessToken).toBe(newAccessToken);
      expect(updatedCred.refreshToken).toBe(newRefreshToken);
      expect(updatedCred.expiresAt).toBeGreaterThan(Date.now());
    });

    it("should retry token refresh up to 3 times on failure", async () => {
      // **Validates: Requirements 3.3**
      const cred = createMockCredential({
        id: "cred-1",
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      // Mock all 3 attempts failing
      fetchMock.mockRejectedValue(new Error("Network error"));

      await expect(tokenManager.acquireContext()).rejects.toThrow(
        "All credentials failed to provide valid tokens"
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("should succeed on second retry attempt", async () => {
      // **Validates: Requirements 3.3**
      const cred = createMockCredential({
        id: "cred-1",
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      // First attempt fails, second succeeds
      fetchMock
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "new-token",
            expires_in: 3600,
          }),
        });

      const context = await tokenManager.acquireContext();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(context.accessToken).toBe("new-token");
    });
  });

  describe("Failover Logic When Credentials Fail", () => {
    it("should failover to next credential when refresh fails", async () => {
      // **Validates: Requirements 3.3, 4.3**
      const cred1 = createMockCredential({
        id: "cred-1",
        priority: 20,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      const cred2 = createMockCredential({
        id: "cred-2",
        priority: 10,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      // Mock refresh failure for cred-1
      fetchMock.mockRejectedValue(new Error("Refresh failed"));

      const context = await tokenManager.acquireContext();

      // Should fall back to cred-2
      expect(context.id).toBe("cred-2");
      expect(context.accessToken).toBe(cred2.accessToken);
    });

    it("should increment failure count on reportFailure", async () => {
      // **Validates: Requirements 4.3, 4.4**
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      await tokenManager.acquireContext();
      const hasAvailable = await tokenManager.reportFailure("cred-1");

      expect(hasAvailable).toBe(true);

      const failureCounts = storageData.get("failureCounts") as Record<string, number>;
      expect(failureCounts["cred-1"]).toBe(1);
    });

    it("should disable credential after 3 consecutive failures", async () => {
      // **Validates: Requirements 4.3**
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      await tokenManager.acquireContext();

      // Report 3 failures
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-1");

      const updatedCred = JSON.parse(kvData.get("credential:cred-1")!) as Credential;
      expect(updatedCred.disabled).toBe(true);
    });

    it("should return false when no credentials available after failure", async () => {
      // **Validates: Requirements 3.4, 4.3**
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      await tokenManager.acquireContext();

      // Report 3 failures to disable the only credential
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-1");
      const hasAvailable = await tokenManager.reportFailure("cred-1");

      expect(hasAvailable).toBe(false);
    });

    it("should select next credential after current is disabled", async () => {
      // **Validates: Requirements 4.3**
      const cred1 = createMockCredential({ id: "cred-1", priority: 20 });
      const cred2 = createMockCredential({ id: "cred-2", priority: 10 });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      await tokenManager.acquireContext();

      // Disable cred-1
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-1");

      // Next acquireContext should use cred-2
      const context = await tokenManager.acquireContext();
      expect(context.id).toBe("cred-2");
    });
  });

  describe("Failure Count Reset on Success", () => {
    it("should reset failure count to zero on reportSuccess", async () => {
      // **Validates: Requirements 3.5, 4.4**
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      await tokenManager.acquireContext();

      // Report failures
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-1");

      let failureCounts = storageData.get("failureCounts") as Record<string, number>;
      expect(failureCounts["cred-1"]).toBe(2);

      // Report success
      await tokenManager.reportSuccess("cred-1");

      failureCounts = storageData.get("failureCounts") as Record<string, number>;
      expect(failureCounts["cred-1"]).toBe(0);
    });

    it("should not throw error when reporting success for unknown credential", async () => {
      // **Validates: Requirements 4.4**
      kvData.set("credential:list", JSON.stringify([]));

      await expect(tokenManager.reportSuccess("unknown-id")).resolves.not.toThrow();
    });

    it("should persist failure counts after reset", async () => {
      // **Validates: Requirements 3.5, 4.4**
      const cred1 = createMockCredential({ id: "cred-1" });
      const cred2 = createMockCredential({ id: "cred-2" });

      kvData.set("credential:list", JSON.stringify(["cred-1", "cred-2"]));
      kvData.set("credential:cred-1", JSON.stringify(cred1));
      kvData.set("credential:cred-2", JSON.stringify(cred2));

      await tokenManager.acquireContext();

      // Set different failure counts
      await tokenManager.reportFailure("cred-1");
      await tokenManager.reportFailure("cred-2");
      await tokenManager.reportFailure("cred-2");

      // Reset cred-1
      await tokenManager.reportSuccess("cred-1");

      const failureCounts = storageData.get("failureCounts") as Record<string, number>;
      expect(failureCounts["cred-1"]).toBe(0);
      expect(failureCounts["cred-2"]).toBe(2);
    });
  });

  describe("HTTP Interface", () => {
    it("should handle /acquireContext request", async () => {
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      const request = new Request("http://localhost/acquireContext", {
        method: "POST",
      });

      const response = await tokenManager.fetch(request);
      const data = await response.json() as CallContext;

      expect(response.status).toBe(200);
      expect(data.id).toBe("cred-1");
      expect(data.accessToken).toBe(cred.accessToken);
    });

    it("should handle /reportSuccess request", async () => {
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      await tokenManager.acquireContext();

      const request = new Request("http://localhost/reportSuccess", {
        method: "POST",
        body: JSON.stringify({ credentialId: "cred-1" }),
      });

      const response = await tokenManager.fetch(request);
      const data = await response.json() as { success: boolean };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should handle /reportFailure request", async () => {
      const cred = createMockCredential({ id: "cred-1" });

      kvData.set("credential:list", JSON.stringify(["cred-1"]));
      kvData.set("credential:cred-1", JSON.stringify(cred));

      await tokenManager.acquireContext();

      const request = new Request("http://localhost/reportFailure", {
        method: "POST",
        body: JSON.stringify({ credentialId: "cred-1" }),
      });

      const response = await tokenManager.fetch(request);
      const data = await response.json() as { success: boolean; hasAvailable: boolean };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.hasAvailable).toBe(true);
    });

    it("should return 404 for unknown paths", async () => {
      const request = new Request("http://localhost/unknown", {
        method: "GET",
      });

      const response = await tokenManager.fetch(request);

      expect(response.status).toBe(404);
    });

    it("should return 500 on error", async () => {
      // Don't set up any credentials to trigger an error
      kvData.clear();

      const request = new Request("http://localhost/acquireContext", {
        method: "POST",
      });

      const response = await tokenManager.fetch(request);

      expect(response.status).toBe(500);
    });
  });
});
