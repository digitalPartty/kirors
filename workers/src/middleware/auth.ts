/**
 * Authentication Middleware
 * 
 * Provides API key authentication for both user and admin endpoints.
 * Supports two authentication methods:
 * - x-api-key header
 * - Authorization: Bearer header
 */

/**
 * Extract API key from request headers
 * 
 * Checks both x-api-key and Authorization: Bearer headers
 * 
 * @param request - The incoming request
 * @returns The extracted API key or null if not found
 */
export function extractApiKey(request: Request): string | null {
  // Check x-api-key header first
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  // Check Authorization: Bearer header
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Constant-time string comparison to prevent timing attacks
 * 
 * Compares two strings in constant time regardless of their content.
 * This prevents attackers from using timing analysis to guess API keys.
 * 
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 */
export function constantTimeEqual(a: string, b: string): boolean {
  // If lengths differ, still compare to maintain constant time
  const aLen = a.length;
  const bLen = b.length;
  const maxLen = Math.max(aLen, bLen);
  
  let result = aLen === bLen ? 0 : 1;
  
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < aLen ? a.charCodeAt(i) : 0;
    const bChar = i < bLen ? b.charCodeAt(i) : 0;
    result |= aChar ^ bChar;
  }
  
  return result === 0;
}

/**
 * Create 401 Unauthorized response
 */
function createUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid or missing API key",
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Authentication middleware for user API endpoints
 * 
 * Validates API key against the configured KIRO_API_KEY
 * 
 * @param request - The incoming request
 * @param apiKey - The configured API key to validate against
 * @returns null if authenticated, Response if authentication failed
 */
export function authenticateUser(
  request: Request,
  apiKey: string | undefined
): Response | null {
  // If no API key is configured, allow all requests
  if (!apiKey) {
    return null;
  }

  const providedKey = extractApiKey(request);
  
  if (!providedKey) {
    return createUnauthorizedResponse();
  }

  if (!constantTimeEqual(providedKey, apiKey)) {
    return createUnauthorizedResponse();
  }

  return null;
}

/**
 * Authentication middleware for admin API endpoints
 * 
 * Validates API key against the configured ADMIN_API_KEY
 * 
 * @param request - The incoming request
 * @param adminApiKey - The configured admin API key to validate against
 * @returns null if authenticated, Response if authentication failed
 */
export function authenticateAdmin(
  request: Request,
  adminApiKey: string | undefined
): Response | null {
  // Admin API key is required
  if (!adminApiKey) {
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "configuration_error",
          message: "Admin API key not configured",
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

  const providedKey = extractApiKey(request);
  
  if (!providedKey) {
    return createUnauthorizedResponse();
  }

  if (!constantTimeEqual(providedKey, adminApiKey)) {
    return createUnauthorizedResponse();
  }

  return null;
}
