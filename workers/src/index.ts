/**
 * Kiro Cloudflare Workers Entry Point
 * 
 * Main entry point for the Cloudflare Workers implementation of the
 * Kiro Anthropic API proxy. This file wires together all components:
 * - Authentication middleware
 * - Request routing
 * - API handlers (models, messages, count_tokens, admin)
 * - TokenManager Durable Object binding
 * - CredentialStore with KV binding
 * - CORS handling
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 15.4, 15.5**
 */

import type { Env } from "./types";
import { authenticateUser, authenticateAdmin } from "./middleware";
import {
  handleModels,
  handleMessages,
  handleCountTokens,
  handleClaudeCodeMessages,
  handleListCredentials,
  handleCreateCredential,
  handleDeleteCredential,
  handleToggleDisabled,
  handleUpdatePriority,
  handleResetFailures,
  handleGetBalance,
  handleAdminUI,
} from "./handlers";
import { logRequest, logError } from "./utils/logger";

/**
 * Add CORS headers to a response
 */
function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}


/**
 * Worker fetch handler
 * 
 * Main entry point that routes all incoming requests to appropriate handlers.
 * Implements authentication, CORS, error handling, and logging.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5**
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Generate request ID for tracking
    const requestId = crypto.randomUUID();
    
    try {
      const url = new URL(request.url);
      
      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      
      // Admin UI - Serve static assets
      if (url.pathname.startsWith("/admin")) {
        const response = await handleAdminUI(request);
        return addCorsHeaders(response);
      }
      
      // Admin endpoints
      if (url.pathname.startsWith("/api/admin/")) {
        const authResult = authenticateAdmin(request, env.ADMIN_API_KEY);
        
        // Log request with authentication status
        logRequest(request.method, url.pathname, !authResult, requestId);
        
        if (authResult) {
          return addCorsHeaders(authResult); // Return 401 or 500 error with CORS
        }
        
        // GET /api/admin/credentials - List all credentials
        if (url.pathname === "/api/admin/credentials" && request.method === "GET") {
          const response = await handleListCredentials(request, env);
          return addCorsHeaders(response);
        }
        
        // POST /api/admin/credentials - Create new credential
        if (url.pathname === "/api/admin/credentials" && request.method === "POST") {
          const response = await handleCreateCredential(request, env);
          return addCorsHeaders(response);
        }
        
        // DELETE /api/admin/credentials/:id - Delete credential
        const deleteMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)$/);
        if (deleteMatch && request.method === "DELETE") {
          const response = await handleDeleteCredential(request, env, deleteMatch[1]);
          return addCorsHeaders(response);
        }
        
        // POST /api/admin/credentials/:id/disabled - Toggle disabled state
        const disabledMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/disabled$/);
        if (disabledMatch && request.method === "POST") {
          const response = await handleToggleDisabled(request, env, disabledMatch[1]);
          return addCorsHeaders(response);
        }
        
        // POST /api/admin/credentials/:id/priority - Update priority
        const priorityMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/priority$/);
        if (priorityMatch && request.method === "POST") {
          const response = await handleUpdatePriority(request, env, priorityMatch[1]);
          return addCorsHeaders(response);
        }
        
        // POST /api/admin/credentials/:id/reset - Reset failure count
        const resetMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/reset$/);
        if (resetMatch && request.method === "POST") {
          const response = await handleResetFailures(request, env, resetMatch[1]);
          return addCorsHeaders(response);
        }
        
        // GET /api/admin/credentials/:id/balance - Get credential balance
        const balanceMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/balance$/);
        if (balanceMatch && request.method === "GET") {
          const response = await handleGetBalance(request, env, balanceMatch[1]);
          return addCorsHeaders(response);
        }
        
        return addCorsHeaders(new Response(JSON.stringify({
          error: {
            type: "not_found_error",
            message: "The requested admin endpoint was not found",
          },
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }));
      }
      
      // API endpoints - require authentication
      if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/cc/v1/")) {
        const authResult = authenticateUser(request, env.KIRO_API_KEY);
        
        // Log request with authentication status
        logRequest(request.method, url.pathname, !authResult, requestId);
        
        if (authResult) {
          return addCorsHeaders(authResult); // Return 401 error with CORS
        }
        
        // Claude Code compatibility mode endpoint
        if (url.pathname === "/cc/v1/messages" && request.method === "POST") {
          const response = await handleClaudeCodeMessages(request, env);
          return addCorsHeaders(response);
        }
        
        // Route to appropriate handler
        if (url.pathname === "/v1/models" && request.method === "GET") {
          const response = await handleModels(request, env);
          return addCorsHeaders(response);
        }
        
        if (url.pathname === "/v1/messages" && request.method === "POST") {
          const response = await handleMessages(request, env);
          return addCorsHeaders(response);
        }
        
        if (url.pathname === "/v1/messages/count_tokens" && request.method === "POST") {
          const response = await handleCountTokens(request, env);
          return addCorsHeaders(response);
        }
        
        return addCorsHeaders(new Response(JSON.stringify({
          error: {
            type: "not_found_error",
            message: "The requested endpoint was not found",
          },
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }));
      }
      
      // Root endpoint
      if (url.pathname === "/") {
        return new Response("Kiro Cloudflare Workers - Anthropic API Proxy", {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }
      
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    } catch (error) {
      // Global exception handler - log error and return 500
      logError(error, "Worker fetch handler", requestId);
      
      return new Response(JSON.stringify({
        error: {
          type: "internal_server_error",
          message: "An unexpected error occurred while processing your request",
        },
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  },
};

/**
 * Export Durable Objects
 */
export { TokenManager } from "./durable-objects";
