/**
 * Structured Logging Utility
 * 
 * Provides structured logging throughout the application for observability
 * and troubleshooting. All logs are output as JSON objects for easy parsing
 * in Cloudflare Workers logs.
 * 
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

/**
 * Base log entry structure
 */
interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

/**
 * Request log entry
 * 
 * **Validates: Requirement 16.1**
 */
export interface RequestLogEntry extends BaseLogEntry {
  type: "request";
  method: string;
  path: string;
  authenticated: boolean;
  requestId?: string;
}

/**
 * Token refresh log entry
 * 
 * **Validates: Requirement 16.2**
 */
export interface TokenRefreshLogEntry extends BaseLogEntry {
  type: "token_refresh";
  credentialId: string;
  outcome: "success" | "failure";
  attempt?: number;
  error?: string;
}

/**
 * Error log entry
 * 
 * **Validates: Requirement 16.3**
 */
export interface ErrorLogEntry extends BaseLogEntry {
  type: "error";
  error: string;
  stack?: string;
  requestId?: string;
  credentialId?: string;
  context?: string;
}

/**
 * Streaming completion log entry
 * 
 * **Validates: Requirement 16.4**
 */
export interface StreamingCompletionLogEntry extends BaseLogEntry {
  type: "streaming_completion";
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  requestId?: string;
  credentialId?: string;
}

/**
 * Credential failover log entry
 * 
 * **Validates: Requirement 16.5**
 */
export interface CredentialFailoverLogEntry extends BaseLogEntry {
  type: "credential_failover";
  fromCredentialId: string;
  toCredentialId: string | null;
  reason: string;
  failureCount: number;
}

/**
 * Log a request
 * 
 * **Validates: Requirement 16.1**
 * 
 * @param method - HTTP method
 * @param path - Request path
 * @param authenticated - Whether the request was authenticated
 * @param requestId - Optional request ID
 */
export function logRequest(
  method: string,
  path: string,
  authenticated: boolean,
  requestId?: string
): void {
  const entry: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    type: "request",
    message: `${method} ${path}`,
    method,
    path,
    authenticated,
    requestId,
  };
  
  console.log(JSON.stringify(entry));
}

/**
 * Log a token refresh operation
 * 
 * **Validates: Requirement 16.2**
 * 
 * @param credentialId - Credential ID
 * @param outcome - Success or failure
 * @param attempt - Attempt number (optional)
 * @param error - Error message if failed (optional)
 */
export function logTokenRefresh(
  credentialId: string,
  outcome: "success" | "failure",
  attempt?: number,
  error?: string
): void {
  const entry: TokenRefreshLogEntry = {
    timestamp: new Date().toISOString(),
    level: outcome === "success" ? LogLevel.INFO : LogLevel.WARN,
    type: "token_refresh",
    message: `Token refresh ${outcome} for credential ${credentialId}`,
    credentialId,
    outcome,
    attempt,
    error,
  };
  
  console.log(JSON.stringify(entry));
}

/**
 * Log an error with context
 * 
 * **Validates: Requirement 16.3**
 * 
 * @param error - Error object or message
 * @param context - Context information (e.g., function name, operation)
 * @param requestId - Optional request ID
 * @param credentialId - Optional credential ID
 */
export function logError(
  error: unknown,
  context?: string,
  requestId?: string,
  credentialId?: string
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.ERROR,
    type: "error",
    message: errorMessage,
    error: errorMessage,
    stack,
    context,
    requestId,
    credentialId,
  };
  
  console.error(JSON.stringify(entry));
}

/**
 * Log streaming completion
 * 
 * **Validates: Requirement 16.4**
 * 
 * @param eventCount - Number of events emitted
 * @param inputTokens - Input token count
 * @param outputTokens - Output token count
 * @param thinkingTokens - Thinking token count (optional)
 * @param requestId - Optional request ID
 * @param credentialId - Optional credential ID
 */
export function logStreamingCompletion(
  eventCount: number,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens?: number,
  requestId?: string,
  credentialId?: string
): void {
  const entry: StreamingCompletionLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    type: "streaming_completion",
    message: `Streaming completed: ${eventCount} events, ${inputTokens} input tokens, ${outputTokens} output tokens`,
    eventCount,
    inputTokens,
    outputTokens,
    thinkingTokens,
    requestId,
    credentialId,
  };
  
  console.log(JSON.stringify(entry));
}

/**
 * Log credential failover
 * 
 * **Validates: Requirement 16.5**
 * 
 * @param fromCredentialId - Credential ID that failed
 * @param toCredentialId - New credential ID (null if none available)
 * @param reason - Reason for failover
 * @param failureCount - Number of failures for the credential
 */
export function logCredentialFailover(
  fromCredentialId: string,
  toCredentialId: string | null,
  reason: string,
  failureCount: number
): void {
  const entry: CredentialFailoverLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.WARN,
    type: "credential_failover",
    message: `Credential failover: ${fromCredentialId} -> ${toCredentialId || "none"} (${reason})`,
    fromCredentialId,
    toCredentialId,
    reason,
    failureCount,
  };
  
  console.warn(JSON.stringify(entry));
}

/**
 * Log a generic info message
 * 
 * @param message - Log message
 * @param data - Additional data to include
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
  const entry: BaseLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    message,
    ...data,
  };
  
  console.log(JSON.stringify(entry));
}

/**
 * Log a generic warning message
 * 
 * @param message - Log message
 * @param data - Additional data to include
 */
export function logWarn(message: string, data?: Record<string, unknown>): void {
  const entry: BaseLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.WARN,
    message,
    ...data,
  };
  
  console.warn(JSON.stringify(entry));
}

/**
 * Log a generic debug message
 * 
 * @param message - Log message
 * @param data - Additional data to include
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
  const entry: BaseLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.DEBUG,
    message,
    ...data,
  };
  
  console.log(JSON.stringify(entry));
}
