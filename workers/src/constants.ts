/**
 * Application constants
 */

// === Model Mappings ===

/**
 * Map Anthropic model names to Kiro model names
 */
export const MODEL_MAPPING: Record<string, string> = {
  // Sonnet models
  "claude-3-5-sonnet-20241022": "claude-sonnet-4.5",
  "claude-3-5-sonnet-20240620": "claude-sonnet-4.5",
  "claude-3-sonnet-20240229": "claude-sonnet-4.5",
  
  // Opus models
  "claude-3-opus-20240229": "claude-opus-4.5",
  
  // Haiku models
  "claude-3-5-haiku-20241022": "claude-haiku-4.5",
  "claude-3-haiku-20240307": "claude-haiku-4.5",
};

/**
 * Map model name to Kiro model ID
 */
export function mapModelName(anthropicModel: string): string {
  // Direct mapping
  if (MODEL_MAPPING[anthropicModel]) {
    return MODEL_MAPPING[anthropicModel];
  }
  
  // Fuzzy matching based on model family
  const lowerModel = anthropicModel.toLowerCase();
  if (lowerModel.includes("sonnet")) {
    return "claude-sonnet-4.5";
  }
  if (lowerModel.includes("opus")) {
    return "claude-opus-4.5";
  }
  if (lowerModel.includes("haiku")) {
    return "claude-haiku-4.5";
  }
  
  // Default to sonnet
  return "claude-sonnet-4.5";
}

// === API Endpoints ===

/**
 * Get Kiro API base URL for a region
 */
export function getKiroApiUrl(region: string): string {
  return `https://api.kiro.${region}.prod.service.aws.dev`;
}

/**
 * Get Kiro MCP API URL for a region
 */
export function getKiroMcpApiUrl(region: string): string {
  return `https://mcp.kiro.${region}.prod.service.aws.dev`;
}

// === Supported Models ===

export const SUPPORTED_MODELS = [
  {
    id: "claude-3-5-sonnet-20241022",
    object: "model",
    created: 1729555200,
    owned_by: "anthropic",
    display_name: "Claude 3.5 Sonnet",
    type: "chat",
    max_tokens: 8192,
  },
  {
    id: "claude-3-5-sonnet-20240620",
    object: "model",
    created: 1718841600,
    owned_by: "anthropic",
    display_name: "Claude 3.5 Sonnet (Legacy)",
    type: "chat",
    max_tokens: 8192,
  },
  {
    id: "claude-3-opus-20240229",
    object: "model",
    created: 1709251200,
    owned_by: "anthropic",
    display_name: "Claude 3 Opus",
    type: "chat",
    max_tokens: 4096,
  },
  {
    id: "claude-3-5-haiku-20241022",
    object: "model",
    created: 1729555200,
    owned_by: "anthropic",
    display_name: "Claude 3.5 Haiku",
    type: "chat",
    max_tokens: 8192,
  },
  {
    id: "claude-3-haiku-20240307",
    object: "model",
    created: 1709769600,
    owned_by: "anthropic",
    display_name: "Claude 3 Haiku",
    type: "chat",
    max_tokens: 4096,
  },
];

// === Limits ===

export const MAX_THINKING_BUDGET_TOKENS = 24576;
export const DEFAULT_THINKING_BUDGET_TOKENS = 20000;

// === Timeouts ===

export const TOKEN_REFRESH_TIMEOUT_MS = 10000;
export const API_REQUEST_TIMEOUT_MS = 300000; // 5 minutes
export const PING_INTERVAL_MS = 25000; // 25 seconds for Claude Code mode

// === Credential Failover ===

export const MAX_CREDENTIAL_FAILURES = 3;
export const CREDENTIAL_FAILURE_RESET_THRESHOLD = 1; // Reset after 1 success
