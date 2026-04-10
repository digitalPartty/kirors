/**
 * Admin API Handlers
 * 
 * Provides credential management endpoints for administrators.
 * All endpoints require admin API key authentication.
 * 
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**
 */

import type { Env } from "../types";
import type { Credential, CredentialInput, CredentialBalance } from "../types/kiro";
import { CredentialStore } from "../storage";
import { logError } from "../utils/logger";

/**
 * GET /api/admin/credentials
 * 
 * List all credentials with their current status.
 * 
 * **Validates: Requirement 12.1**
 */
export async function handleListCredentials(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const credentials = await store.list();

    return new Response(JSON.stringify(credentials), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error listing credentials");
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to list credentials",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials
 * 
 * Create a new credential.
 * 
 * **Validates: Requirement 12.2**
 */
export async function handleCreateCredential(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json() as CredentialInput;

    // Validate required fields
    if (!body.name || !body.clientId || !body.clientSecret || !body.refreshToken) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "Missing required fields: name, clientId, clientSecret, refreshToken",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const store = new CredentialStore(env.CREDENTIALS_KV);
    const credential = await store.create(body);

    return new Response(JSON.stringify(credential), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error creating credential");
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to create credential",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * DELETE /api/admin/credentials/:id
 * 
 * Remove a credential.
 * 
 * **Validates: Requirement 12.3**
 */
export async function handleDeleteCredential(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const deleted = await store.delete(credentialId);

    if (!deleted) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "Credential not found",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Credential deleted successfully",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logError(error, "Error deleting credential", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to delete credential",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials/:id/disabled
 * 
 * Toggle credential disabled state.
 * 
 * **Validates: Requirement 12.4**
 */
export async function handleToggleDisabled(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const body = await request.json() as { disabled: boolean };

    if (typeof body.disabled !== "boolean") {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "Field 'disabled' must be a boolean",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const store = new CredentialStore(env.CREDENTIALS_KV);
    const updated = await store.update(credentialId, {
      disabled: body.disabled,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "Credential not found",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error toggling disabled state", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to update credential",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials/:id/priority
 * 
 * Update credential priority.
 * 
 * **Validates: Requirement 12.5**
 */
export async function handleUpdatePriority(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const body = await request.json() as { priority: number };

    if (typeof body.priority !== "number") {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "Field 'priority' must be a number",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const store = new CredentialStore(env.CREDENTIALS_KV);
    const updated = await store.update(credentialId, {
      priority: body.priority,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "Credential not found",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error updating priority", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to update credential",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials/:id/reset
 * 
 * Reset credential failure count.
 * 
 * **Validates: Requirement 12.6**
 */
export async function handleResetFailures(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const updated = await store.update(credentialId, {
      failureCount: 0,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "Credential not found",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error resetting failures", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to reset failures",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * GET /api/admin/credentials/:id/balance
 * 
 * Query credential usage quota from Kiro API.
 * 
 * **Validates: Requirements 12.7, 19.1, 19.2**
 */
export async function handleGetBalance(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const credential = await store.get(credentialId);

    if (!credential) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "Credential not found",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Query Kiro API for balance information
    const balance = await queryKiroBalance(credential, env);

    return new Response(JSON.stringify(balance), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "Error querying balance", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "Failed to query balance",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * Query Kiro API for credential balance
 * 
 * Makes a request to the Kiro API to retrieve usage quota information.
 * 
 * @param credential - The credential to query
 * @param env - Environment bindings
 * @returns Balance information
 */
async function queryKiroBalance(
  credential: Credential,
  env: Env
): Promise<CredentialBalance> {
  const region = env.KIRO_REGION || "us-east-1";
  const url = `https://api.kiro.${region}.aws.dev/usageLimits`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${credential.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kiro API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as {
    totalQuota?: number;
    usedQuota?: number;
    remainingQuota?: number;
  };

  return {
    total: data.totalQuota || 0,
    used: data.usedQuota || 0,
    remaining: data.remainingQuota || 0,
  };
}
