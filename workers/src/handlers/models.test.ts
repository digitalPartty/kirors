/**
 * Tests for GET /v1/models endpoint
 */

import { describe, it, expect } from "vitest";
import { handleModels } from "./models";
import type { Env } from "../types/env";
import { SUPPORTED_MODELS } from "../constants";

// Mock environment
const createMockEnv = (): Env => {
  return {
    CREDENTIALS_KV: {} as KVNamespace,
    TOKEN_MANAGER: {} as any,
    KIRO_REGION: "us-east-1",
    KIRO_VERSION: "0.8.0",
    SYSTEM_VERSION: "darwin#24.6.0",
    NODE_VERSION: "22.21.1",
  };
};

describe("handleModels", () => {
  it("should return list of supported models", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/v1/models", {
      method: "GET",
    });

    const response = await handleModels(request, env);
    
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    
    const body = await response.json();
    expect(body.object).toBe("list");
    expect(body.data).toEqual(SUPPORTED_MODELS);
    expect(body.data.length).toBeGreaterThan(0);
    
    // Verify model structure
    const firstModel = body.data[0];
    expect(firstModel).toHaveProperty("id");
    expect(firstModel).toHaveProperty("object");
    expect(firstModel).toHaveProperty("created");
    expect(firstModel).toHaveProperty("owned_by");
    expect(firstModel).toHaveProperty("display_name");
    expect(firstModel).toHaveProperty("type");
    expect(firstModel).toHaveProperty("max_tokens");
  });

  it("should include all Claude model variants", async () => {
    const env = createMockEnv();
    const request = new Request("http://localhost/v1/models", {
      method: "GET",
    });

    const response = await handleModels(request, env);
    const body = await response.json();
    
    const modelIds = body.data.map((m: any) => m.id);
    
    // Check for Sonnet models
    expect(modelIds.some((id: string) => id.includes("sonnet"))).toBe(true);
    
    // Check for Opus models
    expect(modelIds.some((id: string) => id.includes("opus"))).toBe(true);
    
    // Check for Haiku models
    expect(modelIds.some((id: string) => id.includes("haiku"))).toBe(true);
  });
});
