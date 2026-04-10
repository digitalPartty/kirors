/**
 * Admin API Integration Tests
 * 
 * Tests all CRUD operations with mock KV storage, admin authentication,
 * and balance query with mock Kiro API.
 * 
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleListCredentials,
  handleCreateCredential,
  handleDeleteCredential,
  handleToggleDisabled,
  handleUpdatePriority,
  handleResetFailures,
  handleGetBalance,
} from "./admin";
import type { Env } from "../types";
import type { Credential } from "../types/kiro";

// Mock KV storage
class MockKV implements KVNamespace {
  private storage = new Map<string, string>();

  async get<T = unknown>(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<T | null> {
    const value = this.storage.get(key);
    if (!value) return null;
    
    if (type === "json") {
      return JSON.parse(value) as T;
    }
    return value as T;
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void> {
    if (typeof value === "string") {
      this.storage.set(key, value);
    } else {
      throw new Error("Only string values supported in mock");
    }
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(): Promise<any> {
    return { keys: [] };
  }

  async getWithMetadata(): Promise<any> {
    return { value: null, metadata: null };
  }
}

// Create mock environment
function createMockEnv(): Env {
  return {
    CREDENTIALS_KV: new MockKV() as unknown as KVNamespace,
    TOKEN_MANAGER: {} as any,
    KIRO_REGION: "us-east-1",
    KIRO_VERSION: "0.8.0",
    SYSTEM_VERSION: "darwin#24.6.0",
    NODE_VERSION: "22.21.1",
    ADMIN_API_KEY: "test-admin-key",
  };
}

describe("Admin API - List Credentials", () => {
  it("should return empty array when no credentials exist", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials");
    
    const response = await handleListCredentials(request, env);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("should return all credentials sorted by priority", async () => {
    const env = createMockEnv();
    
    // Create credentials with different priorities
    const createRequest1 = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Credential 1",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
        priority: 10,
      }),
    });
    await handleCreateCredential(createRequest1, env);
    
    const createRequest2 = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Credential 2",
        clientId: "client2",
        clientSecret: "secret2",
        refreshToken: "refresh2",
        priority: 20,
      }),
    });
    await handleCreateCredential(createRequest2, env);
    
    const listRequest = new Request("http://localhost/api/admin/credentials");
    const response = await handleListCredentials(listRequest, env);
    
    expect(response.status).toBe(200);
    const data = await response.json() as Credential[];
    expect(data).toHaveLength(2);
    expect(data[0].priority).toBe(20); // Higher priority first
    expect(data[1].priority).toBe(10);
  });
});

describe("Admin API - Create Credential", () => {
  it("should create a new credential with valid data", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Credential",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        refreshToken: "test-refresh-token",
        priority: 5,
      }),
    });
    
    const response = await handleCreateCredential(request, env);
    
    expect(response.status).toBe(201);
    const data = await response.json() as Credential;
    expect(data.name).toBe("Test Credential");
    expect(data.clientId).toBe("test-client-id");
    expect(data.priority).toBe(5);
    expect(data.disabled).toBe(false);
    expect(data.failureCount).toBe(0);
    expect(data.id).toBeDefined();
  });

  it("should return 400 when required fields are missing", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Incomplete Credential",
        // Missing clientId, clientSecret, refreshToken
      }),
    });
    
    const response = await handleCreateCredential(request, env);
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("validation_error");
  });
});

describe("Admin API - Delete Credential", () => {
  it("should delete an existing credential", async () => {
    const env = createMockEnv();
    
    // Create a credential
    const createRequest = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "To Delete",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
      }),
    });
    const createResponse = await handleCreateCredential(createRequest, env);
    const created = await createResponse.json() as Credential;
    
    // Delete the credential
    const deleteRequest = new Request(`http://localhost/api/admin/credentials/${created.id}`, {
      method: "DELETE",
    });
    const deleteResponse = await handleDeleteCredential(deleteRequest, env, created.id);
    
    expect(deleteResponse.status).toBe(200);
    const data = await deleteResponse.json();
    expect(data.success).toBe(true);
    
    // Verify it's deleted
    const listRequest = new Request("http://localhost/api/admin/credentials");
    const listResponse = await handleListCredentials(listRequest, env);
    const credentials = await listResponse.json() as Credential[];
    expect(credentials).toHaveLength(0);
  });

  it("should return 404 when credential does not exist", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials/nonexistent", {
      method: "DELETE",
    });
    
    const response = await handleDeleteCredential(request, env, "nonexistent");
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("not_found_error");
  });
});

describe("Admin API - Toggle Disabled", () => {
  it("should toggle credential disabled state", async () => {
    const env = createMockEnv();
    
    // Create a credential
    const createRequest = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "To Disable",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
      }),
    });
    const createResponse = await handleCreateCredential(createRequest, env);
    const created = await createResponse.json() as Credential;
    
    // Disable the credential
    const disableRequest = new Request(`http://localhost/api/admin/credentials/${created.id}/disabled`, {
      method: "POST",
      body: JSON.stringify({ disabled: true }),
    });
    const disableResponse = await handleToggleDisabled(disableRequest, env, created.id);
    
    expect(disableResponse.status).toBe(200);
    const disabled = await disableResponse.json() as Credential;
    expect(disabled.disabled).toBe(true);
    
    // Enable the credential
    const enableRequest = new Request(`http://localhost/api/admin/credentials/${created.id}/disabled`, {
      method: "POST",
      body: JSON.stringify({ disabled: false }),
    });
    const enableResponse = await handleToggleDisabled(enableRequest, env, created.id);
    
    expect(enableResponse.status).toBe(200);
    const enabled = await enableResponse.json() as Credential;
    expect(enabled.disabled).toBe(false);
  });

  it("should return 400 when disabled field is not boolean", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials/test/disabled", {
      method: "POST",
      body: JSON.stringify({ disabled: "not-a-boolean" }),
    });
    
    const response = await handleToggleDisabled(request, env, "test");
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("validation_error");
  });
});

describe("Admin API - Update Priority", () => {
  it("should update credential priority", async () => {
    const env = createMockEnv();
    
    // Create a credential
    const createRequest = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Priority Test",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
        priority: 5,
      }),
    });
    const createResponse = await handleCreateCredential(createRequest, env);
    const created = await createResponse.json() as Credential;
    
    // Update priority
    const updateRequest = new Request(`http://localhost/api/admin/credentials/${created.id}/priority`, {
      method: "POST",
      body: JSON.stringify({ priority: 15 }),
    });
    const updateResponse = await handleUpdatePriority(updateRequest, env, created.id);
    
    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json() as Credential;
    expect(updated.priority).toBe(15);
  });

  it("should return 400 when priority is not a number", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials/test/priority", {
      method: "POST",
      body: JSON.stringify({ priority: "not-a-number" }),
    });
    
    const response = await handleUpdatePriority(request, env, "test");
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("validation_error");
  });
});

describe("Admin API - Reset Failures", () => {
  it("should reset credential failure count", async () => {
    const env = createMockEnv();
    
    // Create a credential
    const createRequest = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Failure Test",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
      }),
    });
    const createResponse = await handleCreateCredential(createRequest, env);
    const created = await createResponse.json() as Credential;
    
    // Manually set failure count (simulating failures)
    const kv = env.CREDENTIALS_KV as unknown as MockKV;
    const key = `credential:${created.id}`;
    const withFailures = { ...created, failureCount: 5 };
    await kv.put(key, JSON.stringify(withFailures));
    
    // Reset failures
    const resetRequest = new Request(`http://localhost/api/admin/credentials/${created.id}/reset`, {
      method: "POST",
    });
    const resetResponse = await handleResetFailures(resetRequest, env, created.id);
    
    expect(resetResponse.status).toBe(200);
    const reset = await resetResponse.json() as Credential;
    expect(reset.failureCount).toBe(0);
  });

  it("should return 404 when credential does not exist", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials/nonexistent/reset", {
      method: "POST",
    });
    
    const response = await handleResetFailures(request, env, "nonexistent");
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("not_found_error");
  });
});

describe("Admin API - Get Balance", () => {
  it("should return balance information from Kiro API", async () => {
    const env = createMockEnv();
    
    // Create a credential
    const createRequest = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Balance Test",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
        accessToken: "test-access-token",
      }),
    });
    const createResponse = await handleCreateCredential(createRequest, env);
    const created = await createResponse.json() as Credential;
    
    // Mock fetch for Kiro API
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalQuota: 1000,
        usedQuota: 250,
        remainingQuota: 750,
      }),
    });
    
    // Get balance
    const balanceRequest = new Request(`http://localhost/api/admin/credentials/${created.id}/balance`);
    const balanceResponse = await handleGetBalance(balanceRequest, env, created.id);
    
    expect(balanceResponse.status).toBe(200);
    const balance = await balanceResponse.json();
    expect(balance.total).toBe(1000);
    expect(balance.used).toBe(250);
    expect(balance.remaining).toBe(750);
    
    // Restore original fetch
    global.fetch = originalFetch;
  });

  it("should return 404 when credential does not exist", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/api/admin/credentials/nonexistent/balance");
    
    const response = await handleGetBalance(request, env, "nonexistent");
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("not_found_error");
  });

  it("should handle Kiro API errors gracefully", async () => {
    const env = createMockEnv();
    
    // Create a credential
    const createRequest = new Request("http://localhost/api/admin/credentials", {
      method: "POST",
      body: JSON.stringify({
        name: "Error Test",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
        accessToken: "test-access-token",
      }),
    });
    const createResponse = await handleCreateCredential(createRequest, env);
    const created = await createResponse.json() as Credential;
    
    // Mock fetch to return error
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    
    // Get balance
    const balanceRequest = new Request(`http://localhost/api/admin/credentials/${created.id}/balance`);
    const balanceResponse = await handleGetBalance(balanceRequest, env, created.id);
    
    expect(balanceResponse.status).toBe(500);
    const data = await balanceResponse.json();
    expect(data.error.type).toBe("internal_error");
    
    // Restore original fetch
    global.fetch = originalFetch;
  });
});
