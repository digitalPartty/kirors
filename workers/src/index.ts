/**
 * Kiro Cloudflare Workers Entry Point
 * 
 * Main entry point for the Cloudflare Workers implementation of the
 * Kiro Anthropic API proxy.
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
import { logRequest } from "./utils/logger";

/**
 * Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
        },
      });
    }
    
    // Generate request ID for tracking
    const requestId = crypto.randomUUID();
    
    // Admin UI - Serve static assets
    if (url.pathname.startsWith("/admin")) {
      return handleAdminUI(request);
    }
    
    // Admin endpoints
    if (url.pathname.startsWith("/api/admin/")) {
      const authResult = authenticateAdmin(request, env.ADMIN_API_KEY);
      
      // Log request with authentication status
      logRequest(request.method, url.pathname, !authResult, requestId);
      
      if (authResult) {
        return authResult; // Return 401 or 500 error
      }
      
      // GET /api/admin/credentials - List all credentials
      if (url.pathname === "/api/admin/credentials" && request.method === "GET") {
        return handleListCredentials(request, env);
      }
      
      // POST /api/admin/credentials - Create new credential
      if (url.pathname === "/api/admin/credentials" && request.method === "POST") {
        return handleCreateCredential(request, env);
      }
      
      // DELETE /api/admin/credentials/:id - Delete credential
      const deleteMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)$/);
      if (deleteMatch && request.method === "DELETE") {
        return handleDeleteCredential(request, env, deleteMatch[1]);
      }
      
      // POST /api/admin/credentials/:id/disabled - Toggle disabled state
      const disabledMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/disabled$/);
      if (disabledMatch && request.method === "POST") {
        return handleToggleDisabled(request, env, disabledMatch[1]);
      }
      
      // POST /api/admin/credentials/:id/priority - Update priority
      const priorityMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/priority$/);
      if (priorityMatch && request.method === "POST") {
        return handleUpdatePriority(request, env, priorityMatch[1]);
      }
      
      // POST /api/admin/credentials/:id/reset - Reset failure count
      const resetMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/reset$/);
      if (resetMatch && request.method === "POST") {
        return handleResetFailures(request, env, resetMatch[1]);
      }
      
      // GET /api/admin/credentials/:id/balance - Get credential balance
      const balanceMatch = url.pathname.match(/^\/api\/admin\/credentials\/([^/]+)\/balance$/);
      if (balanceMatch && request.method === "GET") {
        return handleGetBalance(request, env, balanceMatch[1]);
      }
      
      return new Response(JSON.stringify({
        error: {
          type: "not_found_error",
          message: "The requested admin endpoint was not found",
        },
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
    
    // API endpoints - require authentication
    if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/cc/v1/")) {
      const authResult = authenticateUser(request, env.KIRO_API_KEY);
      
      // Log request with authentication status
      logRequest(request.method, url.pathname, !authResult, requestId);
      
      if (authResult) {
        return authResult; // Return 401 error
      }
      
      // Claude Code compatibility mode endpoint
      if (url.pathname === "/cc/v1/messages" && request.method === "POST") {
        return handleClaudeCodeMessages(request, env);
      }
      
      // Route to appropriate handler
      if (url.pathname === "/v1/models" && request.method === "GET") {
        return handleModels(request, env);
      }
      
      if (url.pathname === "/v1/messages" && request.method === "POST") {
        return handleMessages(request, env);
      }
      
      if (url.pathname === "/v1/messages/count_tokens" && request.method === "POST") {
        return handleCountTokens(request, env);
      }
      
      return new Response(JSON.stringify({
        error: {
          type: "not_found_error",
          message: "The requested endpoint was not found",
        },
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      });
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
  },
};

/**
 * Export Durable Objects
 */
export { TokenManager } from "./durable-objects";
