/**
 * Unit tests for CredentialStore
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CredentialStore } from "./credential-store";
import type { CredentialInput } from "../types/kiro";

/**
 * Mock KV namespace for testing
 */
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();

  async get<T = unknown>(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) return null;
    
    if (type === "json") {
      return JSON.parse(value) as T;
    }
    return value as T;
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void> {
    if (typeof value === "string") {
      this.store.set(key, value);
    } else {
      throw new Error("Only string values supported in mock");
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<any> {
    throw new Error("Not implemented in mock");
  }

  async getWithMetadata(): Promise<any> {
    throw new Error("Not implemented in mock");
  }

  clear(): void {
    this.store.clear();
  }
}

describe("CredentialStore", () => {
  let kv: MockKVNamespace;
  let store: CredentialStore;

  beforeEach(() => {
    kv = new MockKVNamespace();
    store = new CredentialStore(kv as unknown as KVNamespace);
  });

  describe("create", () => {
    it("should create a credential with generated ID and timestamps", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const credential = await store.create(input);

      expect(credential.id).toBeDefined();
      expect(credential.name).toBe("Test Credential");
      expect(credential.clientId).toBe("client123");
      expect(credential.clientSecret).toBe("secret123");
      expect(credential.refreshToken).toBe("refresh123");
      expect(credential.accessToken).toBe("");
      expect(credential.expiresAt).toBe(0);
      expect(credential.priority).toBe(0);
      expect(credential.disabled).toBe(false);
      expect(credential.failureCount).toBe(0);
      expect(credential.createdAt).toBeGreaterThan(0);
      expect(credential.updatedAt).toBe(credential.createdAt);
    });

    it("should create a credential with provided optional fields", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
        accessToken: "access123",
        expiresAt: 1234567890,
        priority: 10,
      };

      const credential = await store.create(input);

      expect(credential.accessToken).toBe("access123");
      expect(credential.expiresAt).toBe(1234567890);
      expect(credential.priority).toBe(10);
    });
  });

  describe("get", () => {
    it("should retrieve a credential by ID", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const created = await store.create(input);
      const retrieved = await store.get(created.id);

      expect(retrieved).toEqual(created);
    });

    it("should return null for non-existent credential", async () => {
      const retrieved = await store.get("non-existent-id");
      expect(retrieved).toBeNull();
    });
  });

  describe("list", () => {
    it("should return empty array when no credentials exist", async () => {
      const credentials = await store.list();
      expect(credentials).toEqual([]);
    });

    it("should return all credentials sorted by priority", async () => {
      const input1: CredentialInput = {
        name: "Low Priority",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
        priority: 5,
      };

      const input2: CredentialInput = {
        name: "High Priority",
        clientId: "client2",
        clientSecret: "secret2",
        refreshToken: "refresh2",
        priority: 10,
      };

      const input3: CredentialInput = {
        name: "Medium Priority",
        clientId: "client3",
        clientSecret: "secret3",
        refreshToken: "refresh3",
        priority: 7,
      };

      await store.create(input1);
      await store.create(input2);
      await store.create(input3);

      const credentials = await store.list();

      expect(credentials).toHaveLength(3);
      expect(credentials[0].name).toBe("High Priority");
      expect(credentials[1].name).toBe("Medium Priority");
      expect(credentials[2].name).toBe("Low Priority");
    });
  });

  describe("update", () => {
    it("should update credential fields", async () => {
      const input: CredentialInput = {
        name: "Original Name",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
        priority: 5,
      };

      const created = await store.create(input);
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await store.update(created.id, {
        name: "Updated Name",
        priority: 10,
        accessToken: "new-access-token",
      });

      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(created.id);
      expect(updated!.name).toBe("Updated Name");
      expect(updated!.priority).toBe(10);
      expect(updated!.accessToken).toBe("new-access-token");
      expect(updated!.createdAt).toBe(created.createdAt);
      expect(updated!.updatedAt).toBeGreaterThan(created.updatedAt);
    });

    it("should return null for non-existent credential", async () => {
      const updated = await store.update("non-existent-id", {
        name: "Updated Name",
      });

      expect(updated).toBeNull();
    });

    it("should not allow updating ID or createdAt", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const created = await store.create(input);
      const originalId = created.id;
      const originalCreatedAt = created.createdAt;

      const updated = await store.update(created.id, {
        // @ts-expect-error - Testing that ID cannot be changed
        id: "different-id",
        // @ts-expect-error - Testing that createdAt cannot be changed
        createdAt: 999999,
        name: "Updated Name",
      });

      expect(updated!.id).toBe(originalId);
      expect(updated!.createdAt).toBe(originalCreatedAt);
    });
  });

  describe("delete", () => {
    it("should delete a credential", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const created = await store.create(input);
      const deleted = await store.delete(created.id);

      expect(deleted).toBe(true);

      const retrieved = await store.get(created.id);
      expect(retrieved).toBeNull();

      const list = await store.list();
      expect(list).toHaveLength(0);
    });

    it("should return false for non-existent credential", async () => {
      const deleted = await store.delete("non-existent-id");
      expect(deleted).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle multiple credentials with same priority", async () => {
      const input1: CredentialInput = {
        name: "Credential 1",
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "refresh1",
        priority: 5,
      };

      const input2: CredentialInput = {
        name: "Credential 2",
        clientId: "client2",
        clientSecret: "secret2",
        refreshToken: "refresh2",
        priority: 5,
      };

      await store.create(input1);
      await store.create(input2);

      const credentials = await store.list();
      expect(credentials).toHaveLength(2);
      expect(credentials[0].priority).toBe(5);
      expect(credentials[1].priority).toBe(5);
    });

    it("should handle disabled credentials in list", async () => {
      const input: CredentialInput = {
        name: "Disabled Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const created = await store.create(input);
      await store.update(created.id, { disabled: true });

      const credentials = await store.list();
      expect(credentials).toHaveLength(1);
      expect(credentials[0].disabled).toBe(true);
    });

    it("should handle empty string values in credential fields", async () => {
      const input: CredentialInput = {
        name: "",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const credential = await store.create(input);
      expect(credential.name).toBe("");
      
      const retrieved = await store.get(credential.id);
      expect(retrieved?.name).toBe("");
    });

    it("should handle updating failureCount", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const created = await store.create(input);
      expect(created.failureCount).toBe(0);

      const updated = await store.update(created.id, { failureCount: 3 });
      expect(updated?.failureCount).toBe(3);

      const retrieved = await store.get(created.id);
      expect(retrieved?.failureCount).toBe(3);
    });

    it("should handle updating lastUsed timestamp", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
      };

      const created = await store.create(input);
      expect(created.lastUsed).toBeUndefined();

      const lastUsedTime = Date.now();
      const updated = await store.update(created.id, { lastUsed: lastUsedTime });
      expect(updated?.lastUsed).toBe(lastUsedTime);
    });

    it("should preserve all fields during update", async () => {
      const input: CredentialInput = {
        name: "Test Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
        accessToken: "access123",
        expiresAt: 1234567890,
        priority: 5,
      };

      const created = await store.create(input);
      
      // Update only one field
      const updated = await store.update(created.id, { name: "Updated Name" });

      // All other fields should be preserved
      expect(updated?.clientId).toBe("client123");
      expect(updated?.clientSecret).toBe("secret123");
      expect(updated?.refreshToken).toBe("refresh123");
      expect(updated?.accessToken).toBe("access123");
      expect(updated?.expiresAt).toBe(1234567890);
      expect(updated?.priority).toBe(5);
    });
  });

  describe("serialization and deserialization", () => {
    it("should correctly serialize and deserialize credential with all fields", async () => {
      const input: CredentialInput = {
        name: "Full Credential",
        clientId: "client123",
        clientSecret: "secret123",
        refreshToken: "refresh123",
        accessToken: "access123",
        expiresAt: 1234567890,
        priority: 10,
      };

      const created = await store.create(input);
      const retrieved = await store.get(created.id);

      // Verify all fields are correctly serialized and deserialized
      expect(retrieved).toEqual(created);
      expect(typeof retrieved?.id).toBe("string");
      expect(typeof retrieved?.name).toBe("string");
      expect(typeof retrieved?.priority).toBe("number");
      expect(typeof retrieved?.disabled).toBe("boolean");
      expect(typeof retrieved?.failureCount).toBe("number");
      expect(typeof retrieved?.createdAt).toBe("number");
      expect(typeof retrieved?.updatedAt).toBe("number");
    });

    it("should handle special characters in credential fields", async () => {
      const input: CredentialInput = {
        name: "Test \"Credential\" with 'quotes' & special chars: <>&",
        clientId: "client-123_ABC",
        clientSecret: "secret!@#$%^&*()",
        refreshToken: "refresh+/=",
      };

      const created = await store.create(input);
      const retrieved = await store.get(created.id);

      expect(retrieved?.name).toBe(input.name);
      expect(retrieved?.clientId).toBe(input.clientId);
      expect(retrieved?.clientSecret).toBe(input.clientSecret);
      expect(retrieved?.refreshToken).toBe(input.refreshToken);
    });
  });
});
