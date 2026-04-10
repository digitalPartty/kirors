/**
 * Unit tests for constants and utility functions
 */

import { describe, it, expect } from "vitest";
import { mapModelName } from "./constants";

describe("mapModelName", () => {
  describe("exact model name mapping", () => {
    it("should map claude-3-5-sonnet-20241022 to claude-sonnet-4.5", () => {
      expect(mapModelName("claude-3-5-sonnet-20241022")).toBe("claude-sonnet-4.5");
    });

    it("should map claude-3-5-sonnet-20240620 to claude-sonnet-4.5", () => {
      expect(mapModelName("claude-3-5-sonnet-20240620")).toBe("claude-sonnet-4.5");
    });

    it("should map claude-3-sonnet-20240229 to claude-sonnet-4.5", () => {
      expect(mapModelName("claude-3-sonnet-20240229")).toBe("claude-sonnet-4.5");
    });

    it("should map claude-3-opus-20240229 to claude-opus-4.5", () => {
      expect(mapModelName("claude-3-opus-20240229")).toBe("claude-opus-4.5");
    });

    it("should map claude-3-5-haiku-20241022 to claude-haiku-4.5", () => {
      expect(mapModelName("claude-3-5-haiku-20241022")).toBe("claude-haiku-4.5");
    });

    it("should map claude-3-haiku-20240307 to claude-haiku-4.5", () => {
      expect(mapModelName("claude-3-haiku-20240307")).toBe("claude-haiku-4.5");
    });
  });

  describe("fuzzy model name mapping", () => {
    it("should map any model name containing 'sonnet' to claude-sonnet-4.5", () => {
      expect(mapModelName("claude-sonnet-latest")).toBe("claude-sonnet-4.5");
      expect(mapModelName("claude-4-sonnet-20250101")).toBe("claude-sonnet-4.5");
      expect(mapModelName("sonnet")).toBe("claude-sonnet-4.5");
    });

    it("should map any model name containing 'opus' to claude-opus-4.5", () => {
      expect(mapModelName("claude-opus-latest")).toBe("claude-opus-4.5");
      expect(mapModelName("claude-4-opus-20250101")).toBe("claude-opus-4.5");
      expect(mapModelName("opus")).toBe("claude-opus-4.5");
    });

    it("should map any model name containing 'haiku' to claude-haiku-4.5", () => {
      expect(mapModelName("claude-haiku-latest")).toBe("claude-haiku-4.5");
      expect(mapModelName("claude-4-haiku-20250101")).toBe("claude-haiku-4.5");
      expect(mapModelName("haiku")).toBe("claude-haiku-4.5");
    });

    it("should be case-insensitive for fuzzy matching", () => {
      expect(mapModelName("CLAUDE-SONNET-LATEST")).toBe("claude-sonnet-4.5");
      expect(mapModelName("Claude-Opus-Latest")).toBe("claude-opus-4.5");
      expect(mapModelName("HAIKU")).toBe("claude-haiku-4.5");
    });
  });

  describe("default model mapping", () => {
    it("should default to claude-sonnet-4.5 for unknown model names", () => {
      expect(mapModelName("unknown-model")).toBe("claude-sonnet-4.5");
      expect(mapModelName("claude-4-unknown-20250101")).toBe("claude-sonnet-4.5");
      expect(mapModelName("")).toBe("claude-sonnet-4.5");
    });

    it("should default to claude-sonnet-4.5 for random strings", () => {
      expect(mapModelName("random-string-123")).toBe("claude-sonnet-4.5");
      expect(mapModelName("test")).toBe("claude-sonnet-4.5");
    });
  });

  describe("edge cases", () => {
    it("should handle model names with mixed case in exact mapping", () => {
      // Exact mapping is case-sensitive, so this should fall through to fuzzy matching
      expect(mapModelName("Claude-3-5-Sonnet-20241022")).toBe("claude-sonnet-4.5");
    });

    it("should handle model names with extra whitespace via fuzzy matching", () => {
      // Whitespace prevents exact match, but fuzzy matching still works
      expect(mapModelName(" claude-3-5-sonnet-20241022 ")).toBe("claude-sonnet-4.5");
      expect(mapModelName(" sonnet ")).toBe("claude-sonnet-4.5");
    });

    it("should prioritize exact matches over fuzzy matches", () => {
      // If a model name is in the exact mapping, it should use that
      expect(mapModelName("claude-3-5-sonnet-20241022")).toBe("claude-sonnet-4.5");
    });

    it("should handle model names with multiple family keywords", () => {
      // If a model name contains multiple keywords, the first match wins
      // Based on the order in the function: sonnet, opus, haiku
      expect(mapModelName("claude-sonnet-opus-hybrid")).toBe("claude-sonnet-4.5");
    });
  });
});
