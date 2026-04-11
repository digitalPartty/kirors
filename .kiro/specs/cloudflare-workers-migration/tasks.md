# Implementation Plan: Cloudflare Workers Migration

## Overview

This plan outlines the migration of the kiro-rs Anthropic Claude API proxy from Rust to Cloudflare Workers using TypeScript. The implementation will be done incrementally, starting with core infrastructure, then building protocol layers, API endpoints, and finally the admin interface. Each major component will be tested before moving to the next phase.

## Tasks

- [x] 1. Set up Cloudflare Workers project structure and core types
  - Initialize Wrangler project with TypeScript configuration
  - Define core TypeScript interfaces for Anthropic API types (Message, Content, Tool, Usage)
  - Define Kiro API types (KiroRequest, KiroEvent, CallContext)
  - Set up Workers KV namespace bindings and Durable Object bindings in wrangler.toml
  - Configure environment variables for API keys, region, and endpoints
  - _Requirements: 14.4, 15.4, 15.5_

- [x] 2. Implement credential storage and management
  - [x] 2.1 Create Credential data model and KV storage interface
    - Define Credential interface (id, priority, accessToken, refreshToken, expiresAt, disabled, failureCount)
    - Implement CredentialStore class with Workers KV read/write operations
    - Add methods for list, get, create, update, delete credentials
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_
  
  - [x] 2.2 Write unit tests for CredentialStore
    - Test CRUD operations with mock KV storage
    - Test credential serialization and deserialization
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

- [x] 3. Implement Token Manager Durable Object
  - [x] 3.1 Create TokenManager Durable Object class
    - Implement state management for credentials list and failure tracking
    - Add acquireContext() method to select credential by priority
    - Add reportSuccess() and reportFailure() methods for failure tracking
    - Implement credential sorting by priority
    - _Requirements: 3.1, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 3.2 Implement OAuth token refresh logic
    - Add checkTokenExpiry() method to detect expired tokens
    - Implement refreshToken() method with retry logic (3 attempts)
    - Update credential in KV storage after successful refresh
    - Handle refresh failures and trigger failover
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 3.3 Write unit tests for TokenManager
    - Test credential selection by priority
    - Test token expiry detection and refresh
    - Test failover logic when credentials fail
    - Test failure count reset on success
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4_

- [x] 4. Checkpoint - Verify credential and token management
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement AWS Event Stream binary protocol decoder
  - [x] 5.1 Create EventStreamDecoder class
    - Implement frame parsing according to AWS Event Stream specification
    - Add buffer management for partial frames across chunks
    - Implement CRC32 checksum validation
    - Parse frame headers (header name, header value, header type)
    - Extract payload from validated frames
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 5.2 Write unit tests for EventStreamDecoder
    - Test complete frame parsing with valid CRC32
    - Test partial frame buffering across multiple chunks
    - Test invalid CRC32 rejection
    - Test malformed frame error handling
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Implement Kiro event to Anthropic SSE conversion
  - [x] 6.1 Create SSEBuilder class with state machine
    - Define state machine for message lifecycle (idle, message_started, content_block_active, message_complete)
    - Implement processKiroEvent() method to handle all Kiro event types
    - Add handlers for messageStart, contentBlockStart, contentBlockDelta, contentBlockStop, messageStop
    - Track content block indices and types (text, thinking, tool_use)
    - Accumulate usage statistics across events
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 6.2 Implement thinking content block processing
    - Handle thinking block start, delta, and stop events
    - Track thinking token usage separately
    - Emit SSE events with type: "thinking"
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 6.3 Implement tool use content block processing
    - Handle tool_use block start, delta, and stop events
    - Accumulate tool input JSON across delta events
    - Emit SSE events with type: "tool_use"
    - Set stop_reason to "tool_use" when appropriate
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 6.4 Write unit tests for SSEBuilder
    - Test state machine transitions for complete message flow
    - Test thinking block processing with token tracking
    - Test tool use block processing with JSON accumulation
    - Test event ordering and format compliance
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

- [x] 7. Checkpoint - Verify protocol layer components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement request conversion from Anthropic to Kiro format
  - [x] 8.1 Create RequestConverter class
    - Implement convertAnthropicToKiro() method
    - Convert max_tokens to maxTokens
    - Convert system prompt to systemPrompt array format
    - Convert messages array to Kiro conversation format
    - Convert tools array to Kiro tool definitions
    - Convert thinking configuration to Kiro format
    - Handle metadata preservation
    - _Requirements: 17.1, 17.2, 17.4, 17.5_
  
  - [x] 8.2 Implement model name mapping
    - Map Anthropic model names (sonnet, opus, haiku) to Kiro model names
    - Use configured model mapping from environment variables
    - _Requirements: 15.1, 15.2, 15.3_
  
  - [x] 8.3 Write unit tests for RequestConverter
    - Test all field conversions with sample requests
    - Test model name mapping for all variants
    - Test tool definition conversion
    - Test thinking configuration conversion
    - _Requirements: 17.1, 17.2, 17.4, 17.5, 15.1, 15.2, 15.3_

- [x] 9. Implement authentication middleware
  - [x] 9.1 Create authentication middleware
    - Extract API key from x-api-key header
    - Extract API key from Authorization: Bearer header
    - Validate API key against configured keys
    - Return 401 Unauthorized for missing or invalid keys
    - Distinguish between user API keys and admin API keys
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 9.2 Write unit tests for authentication middleware
    - Test valid API key in x-api-key header
    - Test valid API key in Authorization header
    - Test missing API key returns 401
    - Test invalid API key returns 401
    - Test admin API key validation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 10. Implement core API endpoints
  - [x] 10.1 Implement GET /v1/models endpoint
    - Return JSON array of supported Claude models
    - Include model IDs, display names, and capabilities
    - _Requirements: 1.1_
  
  - [x] 10.2 Implement POST /v1/messages endpoint for non-streaming
    - Parse and validate request body
    - Convert Anthropic request to Kiro format using RequestConverter
    - Acquire CallContext from TokenManager
    - Send request to Kiro API
    - Parse complete response and convert to Anthropic format
    - Return JSON response with message, content, and usage
    - _Requirements: 1.2, 1.5, 17.1, 17.2, 17.3, 17.4, 17.5_
  
  - [x] 10.3 Implement POST /v1/messages endpoint for streaming
    - Parse and validate request body with stream: true
    - Convert Anthropic request to Kiro format
    - Acquire CallContext from TokenManager
    - Send request to Kiro API and get binary stream response
    - Create EventStreamDecoder and SSEBuilder instances
    - Stream binary chunks through decoder and SSE builder
    - Return text/event-stream response with SSE events
    - Report success/failure to TokenManager after completion
    - _Requirements: 1.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 10.4 Write integration tests for /v1/messages endpoints
    - Test non-streaming request with mock Kiro API
    - Test streaming request with mock binary event stream
    - Test error handling for upstream failures
    - _Requirements: 1.2, 1.4, 1.5_

- [x] 11. Checkpoint - Verify core API functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement WebSearch MCP tool integration
  - [x] 12.1 Create WebSearch detection and routing logic
    - Detect when tools array contains exactly one tool named "web_search"
    - Route WebSearch requests to MCP API endpoint instead of standard Kiro API
    - Convert Anthropic tool format to JSON-RPC format for MCP API
    - _Requirements: 9.1, 9.2_
  
  - [x] 12.2 Implement MCP API response conversion
    - Parse JSON-RPC response from MCP API
    - Convert search results to Anthropic tool result format
    - Handle MCP API errors and convert to Anthropic error format
    - _Requirements: 9.3, 9.4_
  
  - [x] 12.3 Write unit tests for WebSearch integration
    - Test web_search tool detection
    - Test routing to MCP API endpoint
    - Test JSON-RPC to Anthropic format conversion
    - Test error handling for MCP API failures
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 13. Implement token counting API
  - [x] 13.1 Create token counting endpoint
    - Implement POST /v1/messages/count_tokens handler
    - Forward request to external token counting API if configured
    - Implement fallback estimation algorithm based on character count
    - Handle external API errors with fallback
    - Return token count in Anthropic format
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 13.2 Write unit tests for token counting
    - Test external API integration with mock responses
    - Test fallback estimation algorithm
    - Test error handling and fallback behavior
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 14. Implement Claude Code compatibility mode
  - [x] 14.1 Create buffered streaming handler for /cc/v1/messages
    - Detect /cc/v1/messages endpoint
    - Buffer all upstream events until stream completes
    - Extract accurate input_tokens from contextUsageEvent
    - Update message_start event with correct token counts
    - Emit ping events every 25 seconds during buffering
    - Send all buffered events in correct order
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_
  
  - [x] 14.2 Write unit tests for Claude Code mode
    - Test event buffering and reordering
    - Test token count extraction and update
    - Test ping event emission timing
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 15. Checkpoint - Verify all API endpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Admin API endpoints
  - [x] 16.1 Create credential management endpoints
    - Implement GET /api/admin/credentials to list all credentials
    - Implement POST /api/admin/credentials to create new credential
    - Implement DELETE /api/admin/credentials/:id to remove credential
    - Implement POST /api/admin/credentials/:id/disabled to toggle disabled state
    - Implement POST /api/admin/credentials/:id/priority to update priority
    - Implement POST /api/admin/credentials/:id/reset to reset failure count
    - All endpoints require admin API key authentication
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  
  - [x] 16.2 Implement credential balance query endpoint
    - Implement GET /api/admin/credentials/:id/balance
    - Query Kiro API for credential usage quota
    - Return structured balance information (total, used, remaining)
    - _Requirements: 12.7, 19.1, 19.2_
  
  - [x] 16.3 Write integration tests for Admin API
    - Test all CRUD operations with mock KV storage
    - Test admin authentication requirement
    - Test balance query with mock Kiro API
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 17. Implement error handling and resilience
  - [x] 17.1 Create error conversion utilities
    - Convert Kiro API 4xx/5xx errors to Anthropic error format
    - Map HTTP status codes appropriately
    - Preserve error messages and details
    - _Requirements: 13.1_
  
  - [x] 17.2 Add timeout and network error handling
    - Implement request timeout handling (return 504 Gateway Timeout)
    - Handle network errors during streaming (close SSE connection gracefully)
    - Handle TokenManager failures (return 503 Service Unavailable)
    - Add global exception handler (return 500 Internal Server Error)
    - _Requirements: 13.2, 13.3, 13.4, 13.5_
  
  - [x] 17.3 Write unit tests for error handling
    - Test error conversion for various HTTP status codes
    - Test timeout handling
    - Test network error handling during streaming
    - Test credential exhaustion scenario
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 18. Implement logging and observability
  - [x] 18.1 Add structured logging throughout the application
    - Log request method, path, and authentication status
    - Log token refresh operations with credential ID and outcome
    - Log errors with stack traces and context (request ID, credential ID)
    - Log streaming completion with event count and token usage
    - Log credential failover events with reason
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 19. Build Admin UI static assets
  - [x] 19.1 Create Admin UI HTML/CSS/JavaScript
    - Build login page with admin API key input
    - Build credential dashboard showing all credentials
    - Display credential status, priority, failure count, enabled/disabled state
    - Add "Add Credential" form with validation
    - Add "Delete" button for each credential
    - Add "Toggle Enabled" button for each credential
    - Add "Update Priority" input for each credential
    - Add "Reset Failures" button for each credential
    - Add "Check Balance" button to query credential quota
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 19.2 Implement Admin UI API client
    - Create JavaScript functions to call all Admin API endpoints
    - Handle authentication with admin API key
    - Display success/error messages for operations
    - Refresh credential list after mutations
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 19.3 Serve Admin UI from /admin route
    - Implement GET /admin handler to serve static HTML
    - Serve CSS and JavaScript assets
    - _Requirements: 11.1_

- [x] 20. Checkpoint - Verify admin interface
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Wire all components together and create main worker entry point
  - [x] 21.1 Create main worker fetch handler
    - Set up request router for all endpoints
    - Wire authentication middleware
    - Connect all API handlers (models, messages, count_tokens, admin)
    - Initialize TokenManager Durable Object binding
    - Initialize CredentialStore with KV binding
    - Handle CORS headers if needed
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 21.2 Add environment variable configuration
    - Load API keys from environment
    - Load AWS region from environment
    - Load Kiro API endpoints from environment
    - Load MCP API endpoint from environment
    - Load token counting API endpoint from environment (optional)
    - _Requirements: 15.4, 15.5_
  
  - [x] 21.3 Write end-to-end integration tests
    - Test complete request flow from client to Kiro API
    - Test streaming with binary event stream parsing
    - Test credential failover scenario
    - Test WebSearch routing
    - Test Admin API operations
    - _Requirements: 1.1, 1.2, 1.4, 4.3, 9.1, 9.2, 12.1, 12.2_

- [x] 22. Final checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- The implementation uses TypeScript as specified in the design document
- All streaming operations use Cloudflare Workers streaming APIs to stay within memory limits
- Durable Objects provide stateful token management across edge locations
- Workers KV provides persistent credential storage globally
