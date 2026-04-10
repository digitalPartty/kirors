# Design Document: Cloudflare Workers Migration for kiro-rs

## Overview

This document outlines the technical design for migrating the kiro-rs Anthropic Claude API proxy from Rust to Cloudflare Workers using TypeScript. The project will rewrite all complex functionality including WebSearch MCP tool integration, streaming response handling with SSE, AWS Event Stream binary protocol parsing, token counting, Admin UI, and multi-credential management with automatic failover.

The migration aims to leverage Cloudflare Workers' global edge network for lower latency while maintaining full compatibility with the existing Anthropic API interface. Key challenges include adapting to Workers' runtime constraints (CPU time limits, memory limits, request size limits) while preserving all existing features including streaming responses, binary protocol parsing, and multi-credential failover logic.

## Architecture

### System Overview

```mermaid
graph TB
    Client[Anthropic API Client]
    CF[Cloudflare Worker]
    KV[Workers KV<br/>Credential Storage]
    DO[Durable Objects<br/>Token Manager]
    Kiro[Kiro API<br/>AWS Endpoint]
    MCP[Kiro MCP API<br/>WebSearch]
    
    Client -->|HTTP/SSE| CF
    CF -->|Read/Write| KV
    CF -->|State Management| DO
    CF -->|Binary Stream| Kiro
    CF -->|JSON-RPC| MCP
    
    subgraph "Cloudflare Workers Runtime"
        CF
        KV
        DO
    end
    
    subgraph "Upstream Services"
        Kiro
        MCP
    end
```

### Request Flow Sequence

```mermaid
sequenceDiagram
    participant Client
    participant Worker
    participant TokenMgr as Durable Object<br/>TokenManager
    participant KiroAPI as Kiro API
    participant EventParser as EventStreamDecoder
    participant SSEBuilder as SSE Builder
    
    Client->>Worker: POST /v1/messages (stream=true)
    Worker->>TokenMgr: acquireContext()
    TokenMgr->>TokenMgr: Check token expiry
    alt Token expired
        TokenMgr->>KiroAPI: Refresh token (OAuth)
        KiroAPI-->>TokenMgr: New access token
    end
    TokenMgr-->>Worker: CallContext (id, token, credentials)
    
    Worker->>KiroAPI: POST /generateAssistantResponse<br/>(Binary Event Stream)
    KiroAPI-->>Worker: Chunked binary response
    
    loop For each chunk
        Worker->>EventParser: feed(chunk)
        EventParser->>EventParser: Decode AWS Event Stream frames
        EventParser-->>Worker: Parsed Event objects
        Worker->>SSEBuilder: processKiroEvent(event)
        SSEBuilder->>SSEBuilder: State machine transition
        SSEBuilder-->>Worker: SSE events
        Worker-->>Client: text/event-stream chunks
    end
    
    Worker->>TokenMgr: reportSuccess(id)
    TokenMgr->>TokenMgr: Reset failure count
```

### Component Architecture

```mermaid
graph LR
    subgraph "API Layer"
        Router[Request Router]
        Auth[Auth Middleware]
        Models[GET /v1/models]
        Messages[POST /v1/messages]
        CountTokens[POST /v1/messages/count_tokens]
        AdminAPI[Admin API Endpoints]
    end
    
    subgraph "Business Logic"
        Converter[Request Converter<br/>Anthropic → Kiro]
        StreamHandler[Stream Handler]
        WebSearch[WebSearch Handler]
        TokenCounter[Token Counter]
    end
    
    subgraph "Protocol Layer"
        EventDecoder[AWS Event Stream Decoder]
        SSEBuilder[SSE Event Builder]
        ThinkingProcessor[Thinking Block Processor]
        ToolUseHandler[Tool Use Handler]
    end
    
    subgraph "Infrastructure"
        TokenManager[Token Manager<br/>Durable Object]
        CredentialStore[Credential Store<br/>Workers KV]
        HTTPClient[HTTP Client<br/>fetch API]
    end
    
    Router --> Auth
    Auth --> Models
    Auth --> Messages
    Auth --> CountTokens
    Auth --> AdminAPI
    
    Messages --> Converter
    Messages --> WebSearch
    Converter --> StreamHandler
    StreamHandler --> EventDecoder
    EventDecoder --> SSEBuilder
    SSEBuilder --> ThinkingProcessor
    SSEBuilder --> ToolUseHandler
    
    StreamHandler --> TokenManager
    WebSearch --> TokenManager
    TokenManager --> CredentialStore
    TokenManager --> HTTPClient
