/**
 * Cloudflare Workers environment bindings
 * 
 * Defines the environment interface with KV namespaces, Durable Objects,
 * and environment variables.
 */

import type { DurableObjectNamespace } from "@cloudflare/workers-types";

/**
 * Environment bindings available to the Worker
 */
export interface Env {
  // KV Namespaces
  CREDENTIALS_KV: KVNamespace;

  // Durable Objects
  TOKEN_MANAGER: DurableObjectNamespace;

  // Environment Variables
  KIRO_REGION: string;
  KIRO_VERSION: string;
  SYSTEM_VERSION: string;
  NODE_VERSION: string;

  // Secrets
  KIRO_API_KEY?: string;
  ADMIN_API_KEY?: string;
  COUNT_TOKENS_API_URL?: string;
  COUNT_TOKENS_API_KEY?: string;
  COUNT_TOKENS_AUTH_TYPE?: string;
  PROXY_URL?: string;
  PROXY_USERNAME?: string;
  PROXY_PASSWORD?: string;
}

/**
 * Configuration derived from environment
 */
export interface Config {
  region: string;
  kiroVersion: string;
  systemVersion: string;
  nodeVersion: string;
  apiKey?: string;
  adminApiKey?: string;
  countTokensApiUrl?: string;
  countTokensApiKey?: string;
  countTokensAuthType: string;
  proxyUrl?: string;
  proxyUsername?: string;
  proxyPassword?: string;
}

/**
 * Create configuration from environment
 */
export function createConfig(env: Env): Config {
  return {
    region: env.KIRO_REGION || "us-east-1",
    kiroVersion: env.KIRO_VERSION || "0.8.0",
    systemVersion: env.SYSTEM_VERSION || "darwin#24.6.0",
    nodeVersion: env.NODE_VERSION || "22.21.1",
    apiKey: env.KIRO_API_KEY,
    adminApiKey: env.ADMIN_API_KEY,
    countTokensApiUrl: env.COUNT_TOKENS_API_URL,
    countTokensApiKey: env.COUNT_TOKENS_API_KEY,
    countTokensAuthType: env.COUNT_TOKENS_AUTH_TYPE || "x-api-key",
    proxyUrl: env.PROXY_URL,
    proxyUsername: env.PROXY_USERNAME,
    proxyPassword: env.PROXY_PASSWORD,
  };
}
