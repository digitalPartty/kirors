/**
 * Utility helper functions
 */

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ""): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(expiresAt: number, bufferMs: number = 60000): boolean {
  return Date.now() >= expiresAt - bufferMs;
}

/**
 * Parse Authorization header
 */
export function parseAuthHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  // Bearer token format
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request: Request): string | null {
  // Check x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) return xApiKey;
  
  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  return parseAuthHeader(authHeader);
}

/**
 * Create error response
 */
export function createErrorResponse(
  type: string,
  message: string,
  status: number = 400
): Response {
  return new Response(
    JSON.stringify({
      error: {
        type,
        message,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Create SSE data string
 */
export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize system prompt to array format
 */
export function normalizeSystemPrompt(
  system: string | Array<{ text: string }> | undefined
): Array<{ text: string }> | undefined {
  if (!system) return undefined;
  
  if (typeof system === "string") {
    return [{ text: system }];
  }
  
  return system;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
