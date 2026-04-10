# Requirements Document: Cloudflare Workers Migration

## Introduction

This document specifies the business and functional requirements for migrating the kiro-rs Anthropic Claude API proxy from Rust to Cloudflare Workers using TypeScript. The system SHALL maintain full compatibility with the existing Anthropic API interface while leveraging Cloudflare Workers' global edge network for improved latency and scalability.

## Glossary

- **Worker**: The Cloudflare Workers runtime environment that executes the proxy service
- **Kiro_API**: The upstream AWS-based API that provides Claude model access
- **MCP_API**: The Kiro MCP API endpoint that provides WebSearch functionality
- **Token_Manager**: A Durable Object that manages OAuth token lifecycle and credential failover
- **Credential_Store**: Workers KV storage for persistent credential data
- **Event_Stream_Decoder**: Component that parses AWS Event Stream binary protocol
- **SSE_Builder**: Component that constructs Server-Sent Events for streaming responses
- **Call_Context**: A session object containing credential ID, access token, and metadata for a single API call
- **Anthropic_Client**: Any HTTP client making requests to the Anthropic-compatible API endpoints
- **Admin_UI**: The web-based management interface for credential administration
- **Failover**: The process of automatically switching to an alternative credential when the current one fails

## Requirements

### Requirement 1: Anthropic API Compatibility

**User Story:** As an API client developer, I want the Cloudflare Workers proxy to be fully compatible with Anthropic's API, so that I can use existing Anthropic SDK clients without modification.

#### Acceptance Criteria

1. WHEN an Anthropic_Client sends a GET request to `/v1/models`, THE Worker SHALL return a JSON response listing all supported Claude models
2. WHEN an Anthropic_Client sends a POST request to `/v1/messages` with valid parameters, THE Worker SHALL create a conversation and return a response in Anthropic's message format
3. WHEN an Anthropic_Client sends a POST request to `/v1/messages/count_tokens` with a message payload, THE Worker SHALL return an estimated token count
4. WHEN an Anthropic_Client includes `stream: true` in the request body, THE Worker SHALL return a `text/event-stream` response with Server-Sent Events
5. WHEN an Anthropic_Client includes `stream: false` or omits the stream parameter, THE Worker SHALL return a complete JSON response after the upstream completes

### Requirement 2: Authentication and Authorization

**User Story:** As a system administrator, I want secure API key authentication, so that only authorized clients can access the proxy service.

#### Acceptance Criteria

1. WHEN an Anthropic_Client includes a valid API key in the `x-api-key` header, THE Worker SHALL authenticate the request and proceed with processing
2. WHEN an Anthropic_Client includes a valid API key in the `Authorization: Bearer` header, THE Worker SHALL authenticate the request and proceed with processing
3. WHEN an Anthropic_Client sends a request without an API key, THE Worker SHALL return a 401 Unauthorized response
4. WHEN an Anthropic_Client sends a request with an invalid API key, THE Worker SHALL return a 401 Unauthorized response
5. WHEN an Anthropic_Client sends a request to Admin API endpoints with a valid admin API key, THE Worker SHALL authenticate the request and allow access

### Requirement 3: Token Management and Refresh

**User Story:** As a system operator, I want automatic OAuth token refresh, so that the service remains available without manual intervention when tokens expire.

#### Acceptance Criteria

1. WHEN the Token_Manager receives a request for a Call_Context and the current access token is expired, THE Token_Manager SHALL refresh the token using the refresh token before returning the context
2. WHEN the Token_Manager successfully refreshes a token, THE Token_Manager SHALL update the Credential_Store with the new access token and expiration time
3. WHEN the Token_Manager fails to refresh a token after 3 attempts, THE Token_Manager SHALL mark the credential as failed and attempt failover to the next credential
4. WHEN all credentials have failed, THE Token_Manager SHALL return an error indicating no available credentials
5. WHEN a credential refresh succeeds after previous failures, THE Token_Manager SHALL reset the failure count for that credential

### Requirement 4: Multi-Credential Failover

**User Story:** As a system administrator, I want automatic credential failover, so that the service remains available even when individual credentials fail or reach rate limits.

#### Acceptance Criteria

1. WHEN the Token_Manager initializes, THE Token_Manager SHALL load all credentials from the Credential_Store and sort them by priority
2. WHEN the Token_Manager needs to acquire a Call_Context, THE Token_Manager SHALL select the highest priority credential that is not disabled and has not exceeded the failure threshold
3. WHEN a credential fails 3 consecutive times, THE Token_Manager SHALL skip that credential and select the next available credential by priority
4. WHEN the Token_Manager reports a successful API call, THE Token_Manager SHALL reset the failure count for the credential used in that call
5. WHEN an administrator updates credential priority via Admin API, THE Token_Manager SHALL re-sort credentials and use the new priority order for subsequent requests

### Requirement 5: AWS Event Stream Protocol Parsing

**User Story:** As a protocol handler developer, I want to parse AWS Event Stream binary protocol, so that I can decode Kiro API responses into structured events.

#### Acceptance Criteria

1. WHEN the Event_Stream_Decoder receives binary chunks from the Kiro_API, THE Event_Stream_Decoder SHALL parse frames according to the AWS Event Stream specification
2. WHEN the Event_Stream_Decoder encounters a complete frame, THE Event_Stream_Decoder SHALL validate the CRC32 checksum and reject frames with invalid checksums
3. WHEN the Event_Stream_Decoder parses a frame with valid headers and payload, THE Event_Stream_Decoder SHALL emit a structured event object
4. WHEN the Event_Stream_Decoder encounters a partial frame at the end of a chunk, THE Event_Stream_Decoder SHALL buffer the partial data and continue parsing when the next chunk arrives
5. WHEN the Event_Stream_Decoder encounters a malformed frame, THE Event_Stream_Decoder SHALL emit an error event and continue processing subsequent frames

### Requirement 6: Server-Sent Events (SSE) Streaming

**User Story:** As an API client developer, I want streaming responses via Server-Sent Events, so that I can display incremental results to users in real-time.

#### Acceptance Criteria

1. WHEN the SSE_Builder receives a `messageStart` event from the Event_Stream_Decoder, THE SSE_Builder SHALL emit a `message_start` SSE event with message metadata
2. WHEN the SSE_Builder receives a `contentBlockStart` event, THE SSE_Builder SHALL emit a `content_block_start` SSE event with block type and index
3. WHEN the SSE_Builder receives a `contentBlockDelta` event with text content, THE SSE_Builder SHALL emit a `content_block_delta` SSE event with the incremental text
4. WHEN the SSE_Builder receives a `messageStop` event, THE SSE_Builder SHALL emit a `message_delta` and `message_stop` SSE event with final usage statistics
5. WHEN the SSE_Builder processes all events for a complete message, THE SSE_Builder SHALL maintain correct event ordering and state transitions according to Anthropic's SSE specification

### Requirement 7: Extended Thinking Support

**User Story:** As an API client developer, I want to use Claude's extended thinking feature, so that I can request deeper reasoning for complex problems.

#### Acceptance Criteria

1. WHEN an Anthropic_Client includes a `thinking` object with `type: "enabled"` in the request, THE Worker SHALL convert this to Kiro API's thinking format and include it in the upstream request
2. WHEN the Kiro_API returns thinking content blocks, THE SSE_Builder SHALL emit `content_block_start`, `content_block_delta`, and `content_block_stop` events with `type: "thinking"`
3. WHEN the SSE_Builder processes thinking blocks, THE SSE_Builder SHALL correctly track token usage for thinking content separately from assistant response content
4. WHEN an Anthropic_Client specifies `budget_tokens` in the thinking configuration, THE Worker SHALL pass this limit to the Kiro_API
5. WHEN thinking content is complete, THE SSE_Builder SHALL transition to processing assistant response content blocks

### Requirement 8: Tool Use and Function Calling

**User Story:** As an API client developer, I want to use Claude's tool calling capabilities, so that I can integrate external functions and APIs into conversations.

#### Acceptance Criteria

1. WHEN an Anthropic_Client includes a `tools` array in the request, THE Worker SHALL convert each tool definition to Kiro API format and include them in the upstream request
2. WHEN the Kiro_API returns a `toolUse` content block, THE SSE_Builder SHALL emit `content_block_start`, `content_block_delta`, and `content_block_stop` events with `type: "tool_use"`
3. WHEN the SSE_Builder processes tool use blocks, THE SSE_Builder SHALL accumulate the tool input JSON across delta events and emit complete tool use events
4. WHEN an Anthropic_Client provides tool results in a subsequent message, THE Worker SHALL convert the tool result format and include it in the conversation history
5. WHEN the Kiro_API indicates a `stop_reason` of `tool_use`, THE SSE_Builder SHALL set the message stop reason to `tool_use` in the final event

### Requirement 9: WebSearch MCP Tool Integration

**User Story:** As an API client developer, I want to use the WebSearch tool through the standard Anthropic tools interface, so that Claude can search the web for current information.

#### Acceptance Criteria

1. WHEN an Anthropic_Client includes exactly one tool with name `web_search` in the tools array, THE Worker SHALL detect this as a WebSearch request
2. WHEN the Worker detects a WebSearch request, THE Worker SHALL route the request to the MCP_API endpoint instead of the standard Kiro_API endpoint
3. WHEN the MCP_API returns search results, THE Worker SHALL convert the JSON-RPC response format to Anthropic's tool result format
4. WHEN the MCP_API returns an error, THE Worker SHALL convert the error to an Anthropic-compatible error response
5. WHEN an Anthropic_Client includes multiple tools or a tool with a different name, THE Worker SHALL use the standard Kiro_API endpoint and not invoke WebSearch logic

### Requirement 10: Token Counting API

**User Story:** As an API client developer, I want to estimate token counts before sending requests, so that I can manage costs and avoid exceeding token limits.

#### Acceptance Criteria

1. WHEN an Anthropic_Client sends a POST request to `/v1/messages/count_tokens` with a message payload, THE Worker SHALL forward the request to the configured token counting API
2. WHEN the external token counting API returns a successful response, THE Worker SHALL return the token count in Anthropic's format
3. WHEN no external token counting API is configured, THE Worker SHALL use a fallback estimation algorithm based on character count
4. WHEN the external token counting API returns an error, THE Worker SHALL fall back to the estimation algorithm
5. WHEN the token counting request includes system prompts, tools, and messages, THE Worker SHALL include all components in the token count estimation

### Requirement 11: Admin UI for Credential Management

**User Story:** As a system administrator, I want a web-based UI to manage credentials, so that I can add, remove, and configure credentials without editing configuration files.

#### Acceptance Criteria

1. WHEN an administrator navigates to `/admin`, THE Worker SHALL serve the Admin_UI static HTML, CSS, and JavaScript assets
2. WHEN an administrator logs into the Admin_UI with a valid admin API key, THE Admin_UI SHALL display a dashboard showing all configured credentials
3. WHEN an administrator views the credential dashboard, THE Admin_UI SHALL display each credential's status, priority, failure count, and enabled/disabled state
4. WHEN an administrator clicks "Add Credential" and submits valid credential data, THE Admin_UI SHALL call the Admin API to create a new credential
5. WHEN an administrator clicks "Delete" on a credential, THE Admin_UI SHALL call the Admin API to remove that credential from the Credential_Store

### Requirement 12: Admin API for Credential Operations

**User Story:** As a system administrator, I want programmatic API endpoints to manage credentials, so that I can automate credential management tasks.

#### Acceptance Criteria

1. WHEN an administrator sends a GET request to `/api/admin/credentials` with a valid admin API key, THE Worker SHALL return a JSON array of all credentials with their current status
2. WHEN an administrator sends a POST request to `/api/admin/credentials` with valid credential data, THE Worker SHALL create a new credential in the Credential_Store
3. WHEN an administrator sends a DELETE request to `/api/admin/credentials/:id`, THE Worker SHALL remove the specified credential from the Credential_Store
4. WHEN an administrator sends a POST request to `/api/admin/credentials/:id/disabled` with a boolean value, THE Worker SHALL update the credential's disabled state
5. WHEN an administrator sends a POST request to `/api/admin/credentials/:id/priority` with a numeric value, THE Worker SHALL update the credential's priority and re-sort the credential list
6. WHEN an administrator sends a POST request to `/api/admin/credentials/:id/reset`, THE Worker SHALL reset the failure count for the specified credential to zero
7. WHEN an administrator sends a GET request to `/api/admin/credentials/:id/balance`, THE Worker SHALL query the Kiro_API for the credential's remaining usage quota and return the balance information

### Requirement 13: Error Handling and Resilience

**User Story:** As a system operator, I want robust error handling, so that the service degrades gracefully and provides useful error messages when problems occur.

#### Acceptance Criteria

1. WHEN the Kiro_API returns a 4xx or 5xx HTTP error, THE Worker SHALL convert the error to an Anthropic-compatible error response with appropriate status code and message
2. WHEN the Event_Stream_Decoder encounters a network error while reading the stream, THE Worker SHALL close the SSE connection and return an error event to the client
3. WHEN the Token_Manager cannot acquire a valid Call_Context due to all credentials failing, THE Worker SHALL return a 503 Service Unavailable response
4. WHEN the Worker encounters a timeout while waiting for the Kiro_API response, THE Worker SHALL abort the request and return a 504 Gateway Timeout response
5. WHEN the Worker encounters an unexpected exception during request processing, THE Worker SHALL log the error details and return a 500 Internal Server Error response

### Requirement 14: Cloudflare Workers Runtime Constraints

**User Story:** As a platform engineer, I want the service to operate within Cloudflare Workers' runtime limits, so that requests complete successfully without hitting platform constraints.

#### Acceptance Criteria

1. WHEN the Worker processes a streaming request, THE Worker SHALL use streaming response APIs to avoid buffering the entire response in memory
2. WHEN the Worker parses binary event streams, THE Worker SHALL process chunks incrementally to stay within the 128MB memory limit
3. WHEN the Worker handles long-running requests, THE Worker SHALL complete within the CPU time limit by using efficient algorithms and avoiding blocking operations
4. WHEN the Worker stores credentials in Workers KV, THE Worker SHALL ensure each credential object is under the 25MB value size limit
5. WHEN the Worker uses Durable Objects for token management, THE Worker SHALL minimize state synchronization overhead to stay within CPU time budgets

### Requirement 15: Model Mapping and Configuration

**User Story:** As an API client developer, I want automatic model name mapping, so that I can use Anthropic model names and have them automatically translated to Kiro model names.

#### Acceptance Criteria

1. WHEN an Anthropic_Client requests a model name containing "sonnet", THE Worker SHALL map it to the Kiro model `claude-sonnet-4.5`
2. WHEN an Anthropic_Client requests a model name containing "opus", THE Worker SHALL map it to the Kiro model `claude-opus-4.5`
3. WHEN an Anthropic_Client requests a model name containing "haiku", THE Worker SHALL map it to the Kiro model `claude-haiku-4.5`
4. WHEN the Worker initializes, THE Worker SHALL load configuration from environment variables including API keys, region, and optional proxy settings
5. WHEN the Worker receives a request, THE Worker SHALL use the configured AWS region for all Kiro_API endpoint URLs

### Requirement 16: Logging and Observability

**User Story:** As a system operator, I want comprehensive logging, so that I can troubleshoot issues and monitor service health.

#### Acceptance Criteria

1. WHEN the Worker processes a request, THE Worker SHALL log the request method, path, and authentication status
2. WHEN the Token_Manager refreshes a token, THE Worker SHALL log the credential ID and refresh outcome (success or failure)
3. WHEN the Worker encounters an error, THE Worker SHALL log the error message, stack trace, and relevant context (request ID, credential ID)
4. WHEN the Worker completes a streaming response, THE Worker SHALL log the total number of events emitted and final token usage
5. WHEN the Worker performs credential failover, THE Worker SHALL log the reason for failover and the new credential being used

### Requirement 17: Request and Response Conversion

**User Story:** As a protocol handler developer, I want accurate conversion between Anthropic and Kiro API formats, so that all request parameters and response fields are correctly translated.

#### Acceptance Criteria

1. WHEN an Anthropic_Client sends a message with `max_tokens`, THE Worker SHALL convert this to Kiro API's `maxTokens` field
2. WHEN an Anthropic_Client sends a message with `system` prompt, THE Worker SHALL convert this to Kiro API's `systemPrompt` array format
3. WHEN the Kiro_API returns usage statistics in `contextUsageEvent`, THE Worker SHALL convert these to Anthropic's `usage` object format with `input_tokens` and `output_tokens`
4. WHEN the Kiro_API returns content blocks, THE Worker SHALL convert each block type (text, thinking, tool_use) to the corresponding Anthropic format
5. WHEN an Anthropic_Client includes `metadata` in the request, THE Worker SHALL preserve this metadata and include it in response events

### Requirement 18: Credential Storage and Persistence

**User Story:** As a system administrator, I want credentials to be persistently stored, so that they survive Worker restarts and are available across all edge locations.

#### Acceptance Criteria

1. WHEN the Worker initializes, THE Token_Manager SHALL load all credentials from the Credential_Store (Workers KV)
2. WHEN an administrator adds a new credential via Admin API, THE Worker SHALL write the credential to the Credential_Store with a unique ID
3. WHEN the Token_Manager refreshes a token, THE Worker SHALL update the credential in the Credential_Store with the new access token and expiration time
4. WHEN an administrator deletes a credential, THE Worker SHALL remove the credential from the Credential_Store
5. WHEN the Credential_Store is empty on first initialization, THE Worker SHALL create default credentials from environment variables if provided

### Requirement 19: Rate Limiting and Quota Management

**User Story:** As a system operator, I want to track credential usage and quotas, so that I can monitor consumption and avoid unexpected service interruptions.

#### Acceptance Criteria

1. WHEN an administrator requests credential balance via Admin API, THE Worker SHALL query the Kiro_API for the credential's remaining quota
2. WHEN the Kiro_API returns quota information, THE Worker SHALL return this in a structured format showing total quota, used quota, and remaining quota
3. WHEN a credential approaches its quota limit, THE Worker SHALL continue using the credential until it is exhausted or returns quota errors
4. WHEN the Kiro_API returns a quota exceeded error, THE Token_Manager SHALL mark the credential as failed and attempt failover
5. WHEN the Token_Manager tracks credential failures, THE Worker SHALL distinguish between authentication failures, quota failures, and network failures

### Requirement 20: Claude Code Compatibility Mode

**User Story:** As a Claude Code IDE user, I want accurate token counts in streaming responses, so that the IDE can display precise usage information.

#### Acceptance Criteria

1. WHEN an Anthropic_Client sends a request to `/cc/v1/messages` with `stream: true`, THE Worker SHALL buffer all upstream events until the stream completes
2. WHEN the Worker receives a `contextUsageEvent` from the Kiro_API, THE Worker SHALL extract the accurate `input_tokens` count
3. WHEN the Worker has buffered all events and received accurate token counts, THE Worker SHALL update the `message_start` event with the correct `input_tokens` value
4. WHEN the Worker sends buffered events to the client, THE Worker SHALL emit a `ping` event every 25 seconds to keep the connection alive
5. WHEN the buffered stream is complete, THE Worker SHALL send all events in the correct order and close the SSE connection
