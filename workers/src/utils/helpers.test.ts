import { describe, it, expect } from "vitest";
import {
  generateId,
  isTokenExpired,
  parseAuthHeader,
  normalizeSystemPrompt,
  clamp,
} from "./helpers";

describe("Utility Helpers", () => {
  describe("generateId", () => {
    it("should generate a unique ID", () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it("should generate ID with prefix", () => {
      const id = generateId("test");
      expect(id).toMatch(/^test-/);
    });
  });

  describe("isTokenExpired", () => {
    it("should return true for expired token", () => {
      const expiresAt = Date.now() - 1000;
      expect(isTokenExpired(expiresAt)).toBe(true);
    });

    it("should return false for valid token", () => {
      const expiresAt = Date.now() + 3600000;
      expect(isTokenExpired(expiresAt)).toBe(false);
    });

    it("should account for buffer time", () => {
      const expiresAt = Date.now() + 30000; // 30 seconds from now
      expect(isTokenExpired(expiresAt, 60000)).toBe(true); // 60 second buffer
      expect(isTokenExpired(expiresAt, 10000)).toBe(false); // 10 second buffer
    });
  });

  describe("parseAuthHeader", () => {
    it("should parse Bearer token", () => {
      const token = parseAuthHeader("Bearer abc123");
      expect(token).toBe("abc123");
    });

    it("should return null for invalid format", () => {
      const token = parseAuthHeader("Invalid abc123");
      expect(token).toBeNull();
    });

    it("should return null for null input", () => {
      const token = parseAuthHeader(null);
      expect(token).toBeNull();
    });
  });

  describe("normalizeSystemPrompt", () => {
    it("should convert string to array format", () => {
      const result = normalizeSystemPrompt("Hello");
      expect(result).toEqual([{ text: "Hello" }]);
    });

    it("should pass through array format", () => {
      const input = [{ text: "Hello" }, { text: "World" }];
      const result = normalizeSystemPrompt(input);
      expect(result).toEqual(input);
    });

    it("should return undefined for undefined input", () => {
      const result = normalizeSystemPrompt(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe("clamp", () => {
    it("should clamp value to min", () => {
      expect(clamp(5, 10, 20)).toBe(10);
    });

    it("should clamp value to max", () => {
      expect(clamp(25, 10, 20)).toBe(20);
    });

    it("should return value if within range", () => {
      expect(clamp(15, 10, 20)).toBe(15);
    });
  });
});
