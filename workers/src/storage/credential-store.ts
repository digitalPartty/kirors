/**
 * Credential Store - KV-backed persistent storage for credentials
 * 
 * Provides CRUD operations for managing multiple credentials with automatic
 * failover support. Credentials are stored in Workers KV for global availability.
 * 
 * **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**
 */

import type { Credential, CredentialInput, CredentialsStatusResponse } from "../types/kiro";

/**
 * Key prefix for credential storage in KV
 */
const CREDENTIAL_PREFIX = "credential:";

/**
 * Key for storing the list of all credential IDs
 */
const CREDENTIAL_LIST_KEY = "credential:list";

/**
 * CredentialStore manages persistent credential storage using Workers KV
 */
export class CredentialStore {
  constructor(private kv: KVNamespace) {}

  /**
   * List all credentials
   * 
   * Returns all credentials sorted by priority (lowest number = highest priority).
   * Includes statistics about total, available, and current credential.
   * 
   * @returns Credentials status response with statistics
   */
  async list(): Promise<CredentialsStatusResponse> {
    // Get the list of credential IDs
    const idList = await this.kv.get<string[]>(CREDENTIAL_LIST_KEY, "json");
    
    if (!idList || idList.length === 0) {
      return {
        total: 0,
        available: 0,
        currentId: "",
        credentials: [],
      };
    }

    // Fetch all credentials in parallel
    const credentials = await Promise.all(
      idList.map(id => this.get(id))
    );

    // Filter out null values (deleted credentials) and sort by priority
    const validCredentials = credentials
      .filter((cred): cred is Credential => cred !== null)
      .sort((a, b) => a.priority - b.priority); // 数字越小优先级越高

    // Calculate statistics
    const total = validCredentials.length;
    const available = validCredentials.filter(c => !c.disabled).length;
    
    // Find current credential (first non-disabled credential by priority)
    const currentCredential = validCredentials.find(c => !c.disabled);
    const currentId = currentCredential?.id || "";

    // Convert to status items
    const credentialItems = validCredentials.map(cred => ({
      id: cred.id,
      priority: cred.priority,
      disabled: cred.disabled,
      failureCount: cred.failureCount,
      isCurrent: cred.id === currentId,
      expiresAt: cred.expiresAt,
      authMethod: cred.authMethod,
      hasProfileArn: !!cred.profileArn,
    }));

    return {
      total,
      available,
      currentId,
      credentials: credentialItems,
    };
  }

  /**
   * Get a credential by ID
   * 
   * @param id - Credential ID
   * @returns Credential object or null if not found
   */
  async get(id: string): Promise<Credential | null> {
    const key = `${CREDENTIAL_PREFIX}${id}`;
    return await this.kv.get<Credential>(key, "json");
  }

  /**
   * Create a new credential
   * 
   * Generates a unique ID, sets timestamps, and stores the credential.
   * Adds the credential ID to the list of all credentials.
   * 
   * @param input - Credential input data
   * @returns Created credential with generated ID and timestamps
   */
  async create(input: CredentialInput): Promise<Credential> {
    const now = Date.now();
    const id = this.generateId();

    const credential: Credential = {
      id,
      refreshToken: input.refreshToken,
      accessToken: undefined,
      profileArn: undefined,
      expiresAt: undefined,
      authMethod: input.authMethod || "social",
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      priority: input.priority ?? 0,
      disabled: false,
      failureCount: 0,
      region: input.region,
      machineId: input.machineId,
      createdAt: now,
      updatedAt: now,
    };

    // Store the credential
    const key = `${CREDENTIAL_PREFIX}${id}`;
    await this.kv.put(key, JSON.stringify(credential));

    // Add to credential list
    await this.addToList(id);

    return credential;
  }

  /**
   * Update an existing credential
   * 
   * Merges the provided updates with the existing credential data.
   * Updates the updatedAt timestamp.
   * 
   * @param id - Credential ID
   * @param updates - Partial credential data to update
   * @returns Updated credential or null if not found
   */
  async update(
    id: string,
    updates: Partial<Omit<Credential, "id" | "createdAt">>
  ): Promise<Credential | null> {
    const existing = await this.get(id);
    
    if (!existing) {
      return null;
    }

    const updated: Credential = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: Date.now(),
    };

    const key = `${CREDENTIAL_PREFIX}${id}`;
    await this.kv.put(key, JSON.stringify(updated));

    return updated;
  }

  /**
   * Delete a credential
   * 
   * Removes the credential from KV storage and from the credential list.
   * 
   * @param id - Credential ID
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    
    if (!existing) {
      return false;
    }

    // Delete the credential
    const key = `${CREDENTIAL_PREFIX}${id}`;
    await this.kv.delete(key);

    // Remove from credential list
    await this.removeFromList(id);

    return true;
  }

  /**
   * Generate a unique credential ID
   * 
   * Uses timestamp and random string for uniqueness.
   * 
   * @returns Unique credential ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
  }

  /**
   * Add a credential ID to the list
   * 
   * @param id - Credential ID to add
   */
  private async addToList(id: string): Promise<void> {
    const idList = await this.kv.get<string[]>(CREDENTIAL_LIST_KEY, "json") || [];
    
    if (!idList.includes(id)) {
      idList.push(id);
      await this.kv.put(CREDENTIAL_LIST_KEY, JSON.stringify(idList));
    }
  }

  /**
   * Remove a credential ID from the list
   * 
   * @param id - Credential ID to remove
   */
  private async removeFromList(id: string): Promise<void> {
    const idList = await this.kv.get<string[]>(CREDENTIAL_LIST_KEY, "json") || [];
    const filtered = idList.filter(existingId => existingId !== id);
    
    await this.kv.put(CREDENTIAL_LIST_KEY, JSON.stringify(filtered));
  }
}
