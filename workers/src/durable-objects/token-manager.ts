/**
 * TokenManager Durable Object
 * 
 * Manages OAuth token lifecycle and credential failover for the Kiro API proxy.
 * Implements state management for multiple credentials with automatic failover
 * based on priority and failure tracking.
 * 
 * **Validates: Requirements 3.1, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5**
 */

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "../types/env";
import type { Credential, CallContext } from "../types/kiro";
import { CredentialStore } from "../storage/credential-store";
import { logTokenRefresh, logCredentialFailover } from "../utils/logger";

/**
 * Maximum consecutive failures before a credential is disabled
 */
const MAX_FAILURES_PER_CREDENTIAL = 3;

/**
 * Token expiry buffer in milliseconds (5 minutes)
 * Tokens expiring within this window are considered expired
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Token refresh threshold in milliseconds (10 minutes)
 * Tokens expiring within this window should be refreshed proactively
 */
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Internal credential entry with runtime state
 */
interface CredentialEntry {
  credential: Credential;
  failureCount: number;
}

/**
 * TokenManager Durable Object
 * 
 * Provides stateful token management with automatic failover across
 * multiple credentials. State is persisted in Durable Object storage.
 */
export class TokenManager {
  private state: DurableObjectState;
  private env: Env;
  private credentialStore: CredentialStore;
  private currentCredentialId: string | null = null;
  private credentials: Map<string, CredentialEntry> = new Map();
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.credentialStore = new CredentialStore(env.CREDENTIALS_KV);
  }

  /**
   * Initialize the TokenManager state
   * 
   * Loads credentials from KV storage and restores failure counts
   * from Durable Object storage.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load credentials from KV
    const credentialList = await this.credentialStore.list();

    // Load failure counts from DO storage
    const failureCounts = await this.state.storage.get<Record<string, number>>("failureCounts") || {};

    // Build credential map with runtime state
    this.credentials.clear();
    for (const credential of credentialList.credentials) {
      this.credentials.set(credential.id, {
        credential,
        failureCount: failureCounts[credential.id] || 0,
      });
    }

    // Load or select current credential
    const storedCurrentId = await this.state.storage.get<string>("currentCredentialId");
    if (storedCurrentId && this.credentials.has(storedCurrentId)) {
      this.currentCredentialId = storedCurrentId;
    } else {
      // Select highest priority available credential
      this.selectHighestPriorityCredential();
    }

    this.initialized = true;
  }

  /**
   * Select the highest priority available credential
   * 
   * Credentials are sorted by priority (highest first), then by
   * failure count (lowest first). Disabled credentials are excluded.
   */
  private selectHighestPriorityCredential(): void {
    const available = Array.from(this.credentials.values())
      .filter(entry => !entry.credential.disabled)
      .sort((a, b) => {
        // Sort by priority (descending)
        if (a.credential.priority !== b.credential.priority) {
          return b.credential.priority - a.credential.priority;
        }
        // Then by failure count (ascending)
        return a.failureCount - b.failureCount;
      });

    if (available.length > 0) {
      this.currentCredentialId = available[0].credential.id;
    } else {
      this.currentCredentialId = null;
    }
  }

  /**
   * Check if a token is expired or expiring soon
   * 
   * @param expiresAt - Token expiration timestamp (RFC3339 string or milliseconds)
   * @param threshold - Time threshold in milliseconds
   * @returns true if token expires within threshold
   */
  private isTokenExpiring(expiresAt: string | number | undefined, threshold: number): boolean {
    if (!expiresAt) {
      return true; // No expiration time means expired
    }
    
    // Convert to milliseconds if it's a string (RFC3339)
    const expiresAtMs = typeof expiresAt === 'string' 
      ? new Date(expiresAt).getTime() 
      : expiresAt;
    
    return expiresAtMs <= Date.now() + threshold;
  }

  /**
   * Check if a credential's token is expired
   * 
   * Uses the TOKEN_EXPIRY_BUFFER_MS to determine if a token
   * should be considered expired (within 5 minutes of expiration).
   * 
   * **Validates: Requirements 3.1**
   * 
   * @param credential - Credential to check
   * @returns true if token is expired or expiring within buffer window
   */
  private checkTokenExpiry(credential: Credential): boolean {
    return this.isTokenExpiring(credential.expiresAt, TOKEN_EXPIRY_BUFFER_MS);
  }

  /**
   * Refresh an OAuth token with retry logic
   * 
   * Calls the appropriate OAuth endpoint based on credential type (Social or IdC)
   * and updates the credential in KV storage. Retries up to 3 times
   * on failure before giving up.
   * 
   * **Validates: Requirements 3.2, 3.3**
   * 
   * @param credential - Credential to refresh
   * @returns Updated credential with new access token
   * @throws Error if all retry attempts fail
   */
  private async refreshToken(credential: Credential): Promise<Credential> {
    // Determine auth method (default to "social" if not specified)
    const authMethod = credential.authMethod?.toLowerCase() || "social";
    
    // Use credential-level region if available, otherwise fall back to env region
    const region = credential.region || this.env.KIRO_REGION || "us-east-1";
    
    // Route to appropriate refresh method
    if (authMethod === "idc" || authMethod === "builder-id" || authMethod === "iam") {
      return this.refreshIdcToken(credential, region);
    } else {
      return this.refreshSocialToken(credential, region);
    }
  }

  /**
   * Refresh Social OAuth token
   * 
   * @param credential - Credential to refresh
   * @param region - AWS region for the refresh endpoint
   * @returns Updated credential with new access token
   */
  private async refreshSocialToken(credential: Credential, region: string): Promise<Credential> {
    const refreshUrl = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(refreshUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, compress, deflate, br",
            "Connection": "close",
          },
          body: JSON.stringify({
            refresh_token: credential.refreshToken,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Social token refresh failed: ${response.status} ${errorText}`);
        }

        const data = await response.json() as {
          access_token: string;
          refresh_token?: string;
          profile_arn?: string;
          expires_in?: number;
        };

        const now = Date.now();
        const expiresAt = data.expires_in ? now + (data.expires_in * 1000) : now + (3600 * 1000);

        const updatedCredential: Credential = {
          ...credential,
          accessToken: data.access_token,
          refreshToken: data.refresh_token || credential.refreshToken,
          profileArn: data.profile_arn || credential.profileArn,
          expiresAt: new Date(expiresAt).toISOString(),
          updatedAt: now,
        };

        // Persist to KV
        await this.credentialStore.update(credential.id, {
          accessToken: updatedCredential.accessToken,
          refreshToken: updatedCredential.refreshToken,
          profileArn: updatedCredential.profileArn,
          expiresAt: updatedCredential.expiresAt,
          updatedAt: updatedCredential.updatedAt,
        });

        logTokenRefresh(credential.id, "success", attempt);
        return updatedCredential;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logTokenRefresh(credential.id, "failure", attempt, lastError.message);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw new Error(
      `Social token refresh failed after ${maxRetries} attempts for credential ${credential.id}: ${lastError?.message}`
    );
  }

  /**
   * Refresh IdC (AWS SSO OIDC) token
   * 
   * @param credential - Credential to refresh
   * @param region - AWS region for the OIDC endpoint
   * @returns Updated credential with new access token
   */
  private async refreshIdcToken(credential: Credential, region: string): Promise<Credential> {
    if (!credential.clientId || !credential.clientSecret) {
      throw new Error("IdC refresh requires clientId and clientSecret");
    }

    const refreshUrl = `https://oidc.${region}.amazonaws.com/token`;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(refreshUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Host": `oidc.${region}.amazonaws.com`,
            "Connection": "keep-alive",
            "x-amz-user-agent": "aws-sdk-js/3.738.0 ua/2.1 os/other lang/js md/browser#unknown_unknown api/sso-oidc#3.738.0 m/E KiroIDE",
            "Accept": "*/*",
            "Accept-Language": "*",
            "sec-fetch-mode": "cors",
            "User-Agent": "node",
            "Accept-Encoding": "br, gzip, deflate",
          },
          body: JSON.stringify({
            client_id: credential.clientId,
            client_secret: credential.clientSecret,
            refresh_token: credential.refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`IdC token refresh failed: ${response.status} ${errorText}`);
        }

        const data = await response.json() as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
        };

        const now = Date.now();
        const expiresAt = data.expires_in ? now + (data.expires_in * 1000) : now + (3600 * 1000);

        const updatedCredential: Credential = {
          ...credential,
          accessToken: data.access_token,
          refreshToken: data.refresh_token || credential.refreshToken,
          expiresAt: new Date(expiresAt).toISOString(),
          updatedAt: now,
        };

        // Persist to KV
        await this.credentialStore.update(credential.id, {
          accessToken: updatedCredential.accessToken,
          refreshToken: updatedCredential.refreshToken,
          expiresAt: updatedCredential.expiresAt,
          updatedAt: updatedCredential.updatedAt,
        });

        logTokenRefresh(credential.id, "success", attempt);
        return updatedCredential;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logTokenRefresh(credential.id, "failure", attempt, lastError.message);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw new Error(
      `IdC token refresh failed after ${maxRetries} attempts for credential ${credential.id}: ${lastError?.message}`
    );
  }

  /**
   * Acquire a call context for making API requests
   * 
   * Selects the best available credential based on priority and failure count,
   * refreshes the token if needed, and returns a context object with the
   * credential ID, access token, and full credential data.
   * 
   * **Validates: Requirements 3.1, 4.1, 4.2**
   * 
   * @returns CallContext with credential ID, token, and credential data
   * @throws Error if no credentials are available or all have failed
   */
  async acquireContext(): Promise<CallContext> {
    await this.initialize();

    if (this.credentials.size === 0) {
      throw new Error("No credentials configured");
    }

    // Try up to the total number of credentials
    const maxAttempts = this.credentials.size;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      // Select current credential
      if (!this.currentCredentialId) {
        this.selectHighestPriorityCredential();
      }

      if (!this.currentCredentialId) {
        throw new Error("No available credentials (all disabled)");
      }

      const entry = this.credentials.get(this.currentCredentialId);
      if (!entry || entry.credential.disabled) {
        // Current credential is not available, select next
        this.selectHighestPriorityCredential();
        continue;
      }

      let credential = entry.credential;

      // Check if token needs refresh
      if (this.isTokenExpiring(credential.expiresAt, TOKEN_REFRESH_THRESHOLD_MS)) {
        try {
          credential = await this.refreshToken(credential);
          
          // Update in-memory credential
          entry.credential = credential;
          this.credentials.set(credential.id, entry);
        } catch (error) {
          console.warn(`Token refresh failed for credential ${credential.id}:`, error);
          
          // Token refresh failed, try next credential
          this.selectNextCredential();
          continue;
        }
      }

      // Return call context
      return {
        id: credential.id,
        accessToken: credential.accessToken || "",
        credentials: credential,
      };
    }

    throw new Error(`All credentials failed to provide valid tokens (tried ${attempts}/${maxAttempts})`);
  }

  /**
   * Select the next available credential by priority
   * 
   * Excludes the current credential and selects the next highest
   * priority credential that is not disabled.
   */
  private selectNextCredential(): void {
    const previousCredentialId = this.currentCredentialId;
    
    const available = Array.from(this.credentials.values())
      .filter(entry => 
        !entry.credential.disabled && 
        entry.credential.id !== this.currentCredentialId
      )
      .sort((a, b) => {
        if (a.credential.priority !== b.credential.priority) {
          return b.credential.priority - a.credential.priority;
        }
        return a.failureCount - b.failureCount;
      });

    if (available.length > 0) {
      this.currentCredentialId = available[0].credential.id;
      this.state.storage.put("currentCredentialId", this.currentCredentialId);
      
      // Log credential failover
      if (previousCredentialId) {
        const previousEntry = this.credentials.get(previousCredentialId);
        logCredentialFailover(
          previousCredentialId,
          this.currentCredentialId,
          "credential_failure",
          previousEntry?.failureCount || 0
        );
      }
    } else {
      this.currentCredentialId = null;
      
      // Log failover with no available credentials
      if (previousCredentialId) {
        const previousEntry = this.credentials.get(previousCredentialId);
        logCredentialFailover(
          previousCredentialId,
          null,
          "no_available_credentials",
          previousEntry?.failureCount || 0
        );
      }
    }
  }

  /**
   * Report successful API call
   * 
   * Resets the failure count for the specified credential.
   * 
   * **Validates: Requirements 3.5, 4.4**
   * 
   * @param credentialId - ID of the credential that succeeded
   */
  async reportSuccess(credentialId: string): Promise<void> {
    await this.initialize();

    const entry = this.credentials.get(credentialId);
    if (!entry) {
      return;
    }

    // Reset failure count
    entry.failureCount = 0;
    this.credentials.set(credentialId, entry);

    // Persist failure counts
    await this.persistFailureCounts();
  }

  /**
   * Report failed API call
   * 
   * Increments the failure count for the specified credential.
   * If the failure count reaches the threshold, the credential is
   * disabled and the next available credential is selected.
   * 
   * **Validates: Requirements 4.3, 4.4**
   * 
   * @param credentialId - ID of the credential that failed
   * @returns true if there are still available credentials, false otherwise
   */
  async reportFailure(credentialId: string): Promise<boolean> {
    await this.initialize();

    const entry = this.credentials.get(credentialId);
    if (!entry) {
      return this.hasAvailableCredentials();
    }

    // Increment failure count
    entry.failureCount++;
    this.credentials.set(credentialId, entry);

    console.warn(
      `Credential ${credentialId} API call failed (${entry.failureCount}/${MAX_FAILURES_PER_CREDENTIAL})`
    );

    // Check if threshold reached
    if (entry.failureCount >= MAX_FAILURES_PER_CREDENTIAL) {
      // Log credential disabled due to failures
      logCredentialFailover(
        credentialId,
        null,
        `max_failures_reached (${entry.failureCount}/${MAX_FAILURES_PER_CREDENTIAL})`,
        entry.failureCount
      );
      
      // Disable credential in KV
      await this.credentialStore.update(credentialId, { disabled: true });
      entry.credential.disabled = true;

      // Select next credential
      if (this.currentCredentialId === credentialId) {
        this.selectNextCredential();
      }
    }

    // Persist failure counts
    await this.persistFailureCounts();

    return this.hasAvailableCredentials();
  }

  /**
   * Report quota exhausted for a credential
   * 
   * Immediately disables the credential (used for 402 MONTHLY_REQUEST_COUNT errors)
   * and switches to the next available credential.
   * 
   * **Validates: Requirements 4.3, 4.5**
   * 
   * @param credentialId - ID of the credential that exhausted quota
   * @returns true if there are still available credentials, false otherwise
   */
  async reportQuotaExhausted(credentialId: string): Promise<boolean> {
    await this.initialize();

    const entry = this.credentials.get(credentialId);
    if (!entry) {
      return this.hasAvailableCredentials();
    }

    if (entry.credential.disabled) {
      return this.hasAvailableCredentials();
    }

    // Immediately disable credential
    entry.credential.disabled = true;
    entry.failureCount = MAX_FAILURES_PER_CREDENTIAL; // Set to threshold for visibility
    this.credentials.set(credentialId, entry);

    console.error(`Credential ${credentialId} quota exhausted (MONTHLY_REQUEST_COUNT), disabled`);

    // Log credential disabled due to quota
    logCredentialFailover(
      credentialId,
      null,
      "quota_exhausted",
      entry.failureCount
    );

    // Disable credential in KV
    await this.credentialStore.update(credentialId, { disabled: true });

    // Select next credential if this was current
    if (this.currentCredentialId === credentialId) {
      this.selectNextCredential();
    }

    // Persist failure counts
    await this.persistFailureCounts();

    return this.hasAvailableCredentials();
  }

  /**
   * Check if there are any available credentials
   * 
   * @returns true if at least one credential is not disabled
   */
  private hasAvailableCredentials(): boolean {
    return Array.from(this.credentials.values()).some(
      entry => !entry.credential.disabled
    );
  }

  /**
   * Persist failure counts to Durable Object storage
   */
  private async persistFailureCounts(): Promise<void> {
    const failureCounts: Record<string, number> = {};
    
    for (const [id, entry] of this.credentials.entries()) {
      failureCounts[id] = entry.failureCount;
    }

    await this.state.storage.put("failureCounts", failureCounts);
  }

  /**
   * Handle HTTP requests to the Durable Object
   * 
   * Provides RPC-style interface for acquiring contexts and reporting
   * success/failure.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/acquireContext" && request.method === "POST") {
        const context = await this.acquireContext();
        return new Response(JSON.stringify(context), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (path === "/reportSuccess" && request.method === "POST") {
        const { credentialId } = await request.json() as { credentialId: string };
        await this.reportSuccess(credentialId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (path === "/reportFailure" && request.method === "POST") {
        const { credentialId } = await request.json() as { credentialId: string };
        const hasAvailable = await this.reportFailure(credentialId);
        return new Response(JSON.stringify({ success: true, hasAvailable }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (path === "/reportQuotaExhausted" && request.method === "POST") {
        const { credentialId } = await request.json() as { credentialId: string };
        const hasAvailable = await this.reportQuotaExhausted(credentialId);
        return new Response(JSON.stringify({ success: true, hasAvailable }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
}
