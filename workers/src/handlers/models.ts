/**
 * GET /v1/models endpoint handler
 * 
 * Returns a list of supported Claude models in Anthropic API format.
 * 
 * **Validates: Requirements 1.1**
 */

import type { Env } from "../types/env";
import type { ModelsResponse } from "../types/anthropic";
import { SUPPORTED_MODELS } from "../constants";

/**
 * Handle GET /v1/models request
 * 
 * @param request - Incoming HTTP request
 * @param env - Environment bindings
 * @returns Response with list of supported models
 */
export async function handleModels(request: Request, env: Env): Promise<Response> {
  const response: ModelsResponse = {
    object: "list",
    data: SUPPORTED_MODELS,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
