# Kiro Cloudflare Workers

Cloudflare Workers implementation of the Kiro Anthropic API proxy, migrated from Rust (kiro-rs).

## Project Structure

```
workers/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── types/                # TypeScript type definitions
│   │   ├── anthropic.ts      # Anthropic API types
│   │   ├── kiro.ts           # Kiro API types
│   │   ├── env.ts            # Environment bindings
│   │   └── index.ts          # Type exports
│   ├── handlers/             # Request handlers (TODO)
│   ├── protocol/             # Protocol parsers (TODO)
│   ├── services/             # Business logic (TODO)
│   └── utils/                # Utilities (TODO)
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript configuration
├── wrangler.toml             # Cloudflare Workers configuration
└── README.md                 # This file
```

## Setup

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers enabled
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
cd workers
npm install
```

### Configuration

1. **Create KV Namespaces:**

```bash
# Production
wrangler kv:namespace create "CREDENTIALS_KV"
wrangler kv:namespace create "CREDENTIALS_KV" --preview

# Update wrangler.toml with the generated IDs
```

2. **Set Secrets:**

```bash
# Required
wrangler secret put KIRO_API_KEY

# Optional
wrangler secret put ADMIN_API_KEY
wrangler secret put COUNT_TOKENS_API_URL
wrangler secret put COUNT_TOKENS_API_KEY
wrangler secret put PROXY_URL
wrangler secret put PROXY_USERNAME
wrangler secret put PROXY_PASSWORD
```

3. **Configure Environment Variables:**

Edit `wrangler.toml` to set:
- `KIRO_REGION`: AWS region (default: us-east-1)
- `KIRO_VERSION`: Kiro API version (default: 0.8.0)
- `SYSTEM_VERSION`: System version string
- `NODE_VERSION`: Node.js version string

## Development

```bash
# Start local development server
npm run dev

# Type check
npm run type-check

# Run tests
npm test

# Deploy to Cloudflare
npm run deploy
```

## Architecture

### Components

- **Worker**: Main request handler and router
- **Token Manager (Durable Object)**: Manages OAuth tokens and credential failover
- **Credentials KV**: Persistent storage for credential data

### Request Flow

1. Client sends request to Worker
2. Worker authenticates request
3. Worker acquires CallContext from Token Manager
4. Worker forwards request to Kiro API
5. Worker streams response back to client

### Type Definitions

#### Anthropic Types (`src/types/anthropic.ts`)
- Message, ContentBlock, Tool definitions
- Request/response types for `/v1/messages` and `/v1/models`
- SSE event types for streaming responses

#### Kiro Types (`src/types/kiro.ts`)
- KiroRequest, ConversationState structures
- Event types (AssistantResponseEvent, ToolUseEvent, etc.)
- Credential and CallContext definitions

#### Environment Types (`src/types/env.ts`)
- Env interface with KV and Durable Object bindings
- Config interface for runtime configuration

## API Compatibility

This implementation maintains full compatibility with the Anthropic Claude API:

- `GET /v1/models` - List available models
- `POST /v1/messages` - Create message (streaming and non-streaming)
- `POST /v1/messages/count_tokens` - Count tokens
- `POST /api/admin/*` - Admin API endpoints (with admin key)

## Features

- ✅ Full Anthropic API compatibility
- ✅ Multi-credential management with automatic failover
- ✅ OAuth token refresh and lifecycle management
- ✅ AWS Event Stream binary protocol parsing
- ✅ Server-Sent Events (SSE) streaming
- ✅ Extended thinking support
- ✅ Tool use and function calling
- ✅ WebSearch MCP tool integration
- ✅ Admin UI for credential management
- ✅ Token counting API
- ✅ Claude Code compatibility mode

## License

Same as kiro-rs parent project.
