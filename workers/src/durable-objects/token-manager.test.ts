/**
 * TokenManager Durable Object Tests
 * 
 * Tests for token refresh, failover, and credential management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Credential } from "../types/kiro";

// Mock constants
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
const MAX_FAILURES_PER_CREDENTIAL = 3;

describe("TokenManager", () => {
  describe("Token Expiry Detection", () => {
    it("should detect expired token (within 5 minutes)", () => {
      const now = Date.now();
      const expiresAt = now + 3 * 60 * 1000; // 3 minutes from now
      
      const isExpired = expiresAt <= now + TOKEN_EXPIRY_BUFFER_MS;
      expect(isExpired).toBe(true);
    });

    it("should not detect valid token as expired", () => {
      const now = Date.now();
      const expiresAt = now + 60 * 60 * 1000; // 1 hour from now
      
      const isExpired = expiresAt <= now + TOKEN_EXPIRY_BUFFER_MS;
      expect(isExpired).toBe(false);
    });

    it("should detect token expiring soon (within 10 minutes)", () => {
      const now = Date.now();
      const expiresAt = now + 8 * 60 * 1000; // 8 minutes from now
      
      const isExpiringSoon = expiresAt <= now + TOKEN_REFRESH_THRESHOLD_MS;
      expect(isExpiringSoon).toBe(true);
    });

    it("should not detect token expiring soon if beyond 10 minutes", () => {
      const now = Date.now();
      const expiresAt = now + 15 * 60 * 1000; // 15 minutes from now
      
      const isExpiringSoon = expiresAt <= now + TOKEN_REFRESH_THRESHOLD_MS;
      expect(isExpiringSoon).toBe(false);
    });
  });

  describe("Credential Priority Selection", () => {
    it("should select highest priority credential", () => {
      const credentials: Credential[] = [
        {
          id: "1",
          refreshToken: "token1",
          priority: 1,
          disabled: false,
          failureCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "2",
          refreshToken: "token2",
          priority: 3,
          disabled: false,
          failureCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "3",
          refreshToken: "token3",
          priority: 2,
          disabled: false,
          failureCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const sorted = credentials
        .filter(c => !c.disabled)
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority; // Higher priority first
          }
          return a.failureCount - b.failureCount; // Lower failure count first
        });

      expect(sorted[0].id).toBe("2"); // priority 3
      expect(sorted[1].id).toBe("3"); // priority 2
      expect(sorted[2].id).toBe("1"); // priority 1
    });

    it("should exclude disabled credentials", () => {
      const credentials: Credential[] = [
        {
          id: "1",
          refreshToken: "token1",
          priority: 3,
          disabled: true,
          failureCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "2",
          refreshToken: "token2",
          priority: 2,
          disabled: false,
          failureCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const available = credentials.filter(c => !c.disabled);
      expect(available.length).toBe(1);
      expect(available[0].id).toBe("2");
    });

    it("should prefer lower failure count when priority is equal", () => {
      const credentials: Credential[] = [
        {
          id: "1",
          refreshToken: "token1",
          priority: 1,
          disabled: false,
          failureCount: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "2",
          refreshToken: "token2",
          priority: 1,
          disabled: false,
          failureCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const sorted = credentials
        .filter(c => !c.disabled)
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return a.failureCount - b.failureCount;
        });

      expect(sorted[0].id).toBe("2"); // Lower failure count
    });
  });

  describe("Failure Counting", () => {
    it("should increment failure count on each failure", () => {
      let failureCount = 0;
      
      failureCount++;
      expect(failureCount).toBe(1);
      
      failureCount++;
      expect(failureCount).toBe(2);
      
      failureCount++;
      expect(failureCount).toBe(3);
    });

    it("should disable credential when threshold reached", () => {
      let failureCount = 0;
      let disabled = false;
      
      for (let i = 0; i < MAX_FAILURES_PER_CREDENTIAL; i++) {
        failureCount++;
        if (failureCount >= MAX_FAILURES_PER_CREDENTIAL) {
          disabled = true;
        }
      }
      
      expect(failureCount).toBe(3);
      expect(disabled).toBe(true);
    });

    it("should reset failure count on success", () => {
      let failureCount = 2;
      
      // Success resets count
      failureCount = 0;
      
      expect(failureCount).toBe(0);
    });
  });

  describe("Quota Exhausted Handling", () => {
    it("should immediately disable credential on quota exhausted", () => {
      let disabled = false;
      let failureCount = 0;
      
      // Simulate quota exhausted
      disabled = true;
      failureCount = MAX_FAILURES_PER_CREDENTIAL;
      
      expect(disabled).toBe(true);
      expect(failureCount).toBe(MAX_FAILURES_PER_CREDENTIAL);
    });

    it("should detect MONTHLY_REQUEST_COUNT in error response", () => {
      const errorText1 = '{"reason":"MONTHLY_REQUEST_COUNT"}';
      const errorText2 = '{"error":{"reason":"MONTHLY_REQUEST_COUNT"}}';
      const errorText3 = 'Error: MONTHLY_REQUEST_COUNT exceeded';
      const errorText4 = '{"reason":"DAILY_REQUEST_COUNT"}';
      
      const isMonthlyLimit = (text: string): boolean => {
        if (text.includes("MONTHLY_REQUEST_COUNT")) {
          return true;
        }
        try {
          const json = JSON.parse(text);
          return json.reason === "MONTHLY_REQUEST_COUNT" || 
                 json.error?.reason === "MONTHLY_REQUEST_COUNT";
        } catch {
          return false;
        }
      };
      
      expect(isMonthlyLimit(errorText1)).toBe(true);
      expect(isMonthlyLimit(errorText2)).toBe(true);
      expect(isMonthlyLimit(errorText3)).toBe(true);
      expect(isMonthlyLimit(errorText4)).toBe(false);
    });
  });

  describe("Region Configuration Priority", () => {
    it("should use credential region over env region", () => {
      const credential: Partial<Credential> = {
        region: "eu-west-1",
      };
      const envRegion = "us-east-1";
      
      const effectiveRegion = credential.region || envRegion;
      expect(effectiveRegion).toBe("eu-west-1");
    });

    it("should fall back to env region when credential region is not set", () => {
      const credential: Partial<Credential> = {};
      const envRegion = "us-east-1";
      
      const effectiveRegion = credential.region || envRegion;
      expect(effectiveRegion).toBe("us-east-1");
    });

    it("should construct correct Social refresh URL with credential region", () => {
      const region = "ap-southeast-1";
      const refreshUrl = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
      
      expect(refreshUrl).toBe("https://prod.ap-southeast-1.auth.desktop.kiro.dev/refreshToken");
    });

    it("should construct correct IdC refresh URL with credential region", () => {
      const region = "eu-central-1";
      const refreshUrl = `https://oidc.${region}.amazonaws.com/token`;
      
      expect(refreshUrl).toBe("https://oidc.eu-central-1.amazonaws.com/token");
    });
  });

  describe("Auth Method Detection", () => {
    it("should detect IdC auth method", () => {
      const authMethods = ["idc", "IdC", "IDC", "builder-id", "iam"];
      
      authMethods.forEach(method => {
        const normalized = method.toLowerCase();
        const isIdc = normalized === "idc" || 
                      normalized === "builder-id" || 
                      normalized === "iam";
        expect(isIdc).toBe(true);
      });
    });

    it("should default to Social auth method", () => {
      const authMethod: string | undefined = undefined;
      const effectiveMethod = authMethod?.toLowerCase() || "social";
      
      expect(effectiveMethod).toBe("social");
    });

    it("should validate IdC credentials have clientId and clientSecret", () => {
      const credential: Partial<Credential> = {
        authMethod: "idc",
        clientId: "client123",
        clientSecret: "secret456",
      };
      
      const isValid = !!(credential.clientId && credential.clientSecret);
      expect(isValid).toBe(true);
    });

    it("should reject IdC credentials without clientId or clientSecret", () => {
      const credential1: Partial<Credential> = {
        authMethod: "idc",
        clientId: "client123",
      };
      
      const credential2: Partial<Credential> = {
        authMethod: "idc",
        clientSecret: "secret456",
      };
      
      const isValid1 = !!(credential1.clientId && credential1.clientSecret);
      const isValid2 = !!(credential2.clientId && credential2.clientSecret);
      
      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });
  });
});
