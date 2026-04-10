/**
 * Authentication Middleware Tests
 */

import { describe, it, expect } from "vitest";
import {
  extractApiKey,
  constantTimeEqual,
  authenticateUser,
  authenticateAdmin,
} from "./auth";

describe("extractApiKey", () => {
  it("should extract API key from x-api-key header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "test-key-123",
      },
    });

    const key = extractApiKey(request);
    expect(key).toBe("test-key-123");
  });

  it("should extract API key from Authorization: Bearer header", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer test-key-456",
      },
    });

    const key = extractApiKey(request);
    expect(key).toBe("test-key-456");
  });

  it("should extract API key from Authorization: bearer header (case insensitive)", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "bearer test-key-789",
      },
    });

    const key = extractApiKey(request);
    expect(key).toBe("test-key-789");
  });

  it("should prioritize x-api-key over Authorization header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "x-api-key-value",
        authorization: "Bearer bearer-value",
      },
    });

    const key = extractApiKey(request);
    expect(key).toBe("x-api-key-value");
  });

  it("should return null when no API key is present", () => {
    const request = new Request("https://example.com");

    const key = extractApiKey(request);
    expect(key).toBeNull();
  });

  it("should return null for malformed Authorization header", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "InvalidFormat",
      },
    });

    const key = extractApiKey(request);
    expect(key).toBeNull();
  });
});

describe("constantTimeEqual", () => {
  it("should return true for equal strings", () => {
    expect(constantTimeEqual("test123", "test123")).toBe(true);
  });

  it("should return false for different strings of same length", () => {
    expect(constantTimeEqual("test123", "test456")).toBe(false);
  });

  it("should return false for strings of different lengths", () => {
    expect(constantTimeEqual("short", "longer-string")).toBe(false);
  });

  it("should return true for empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("should return false when one string is empty", () => {
    expect(constantTimeEqual("", "nonempty")).toBe(false);
  });

  it("should handle special characters", () => {
    expect(constantTimeEqual("key!@#$%", "key!@#$%")).toBe(true);
    expect(constantTimeEqual("key!@#$%", "key!@#$&")).toBe(false);
  });
});

describe("authenticateUser", () => {
  it("should allow request with valid API key in x-api-key header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "valid-key",
      },
    });

    const result = authenticateUser(request, "valid-key");
    expect(result).toBeNull();
  });

  it("should allow request with valid API key in Authorization header", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer valid-key",
      },
    });

    const result = authenticateUser(request, "valid-key");
    expect(result).toBeNull();
  });

  it("should return 401 for missing API key", async () => {
    const request = new Request("https://example.com");

    const result = authenticateUser(request, "valid-key");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);

    const body = await result!.json() as any;
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  it("should return 401 for invalid API key", async () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "invalid-key",
      },
    });

    const result = authenticateUser(request, "valid-key");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);

    const body = await result!.json() as any;
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  it("should allow all requests when API key is not configured", () => {
    const request = new Request("https://example.com");

    const result = authenticateUser(request, undefined);
    expect(result).toBeNull();
  });

  it("should reject request with empty API key when key is configured", async () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "",
      },
    });

    const result = authenticateUser(request, "valid-key");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

describe("authenticateAdmin", () => {
  it("should allow request with valid admin API key in x-api-key header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "admin-key",
      },
    });

    const result = authenticateAdmin(request, "admin-key");
    expect(result).toBeNull();
  });

  it("should allow request with valid admin API key in Authorization header", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer admin-key",
      },
    });

    const result = authenticateAdmin(request, "admin-key");
    expect(result).toBeNull();
  });

  it("should return 401 for missing admin API key", async () => {
    const request = new Request("https://example.com");

    const result = authenticateAdmin(request, "admin-key");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);

    const body = await result!.json() as any;
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  it("should return 401 for invalid admin API key", async () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "wrong-admin-key",
      },
    });

    const result = authenticateAdmin(request, "admin-key");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);

    const body = await result!.json() as any;
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  it("should return 500 when admin API key is not configured", async () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "some-key",
      },
    });

    const result = authenticateAdmin(request, undefined);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);

    const body = await result!.json() as any;
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("configuration_error");
  });

  it("should distinguish between user and admin API keys", async () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "user-key",
      },
    });

    const result = authenticateAdmin(request, "admin-key");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});
