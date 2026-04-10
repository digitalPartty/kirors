/**
 * Anthropic API type definitions
 * 
 * These types match the Anthropic Claude API specification and ensure
 * compatibility with existing Anthropic SDK clients.
 */

// === Error Response Types ===

export interface ErrorResponse {
  error: ErrorDetail;
}

export interface ErrorDetail {
  type: string;
  message: string;
}

// === Model Types ===

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  display_name: string;
  type: string;
  max_tokens: number;
}

export interface ModelsResponse {
  object: string;
  data: Model[];
}

// === Message Types ===

export interface Message {
  role: string;
  content: string | ContentBlock[];
}

export interface SystemMessage {
  text: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  tool_use_id?: string;
  content?: unknown;
  name?: string;
  input?: unknown;
  id?: string;
  is_error?: boolean;
  source?: ImageSource;
}

export interface ImageSource {
  type: string;
  media_type: string;
  data: string;
}

// === Tool Types ===

export interface Tool {
  type?: string; // e.g., "web_search_20250305"
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  max_uses?: number;
}

// === Thinking Configuration ===

export interface Thinking {
  type: string; // "enabled"
  budget_tokens?: number;
}

// === Metadata ===

export interface Metadata {
  user_id?: string;
}

// === Messages Request ===

export interface MessagesRequest {
  model: string;
  max_tokens: number;
  messages: Message[];
  stream?: boolean;
  system?: string | SystemMessage[];
  tools?: Tool[];
  tool_choice?: unknown;
  thinking?: Thinking;
  metadata?: Metadata;
}

// === Count Tokens Types ===

export interface CountTokensRequest {
  model: string;
  messages: Message[];
  system?: string | SystemMessage[];
  tools?: Tool[];
}

export interface CountTokensResponse {
  input_tokens: number;
}

// === Usage Statistics ===

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

// === SSE Event Types ===

export interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: Usage;
  };
}

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: ContentBlock;
}

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason: string | null;
    stop_sequence: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

export interface MessageStopEvent {
  type: "message_stop";
}

export interface PingEvent {
  type: "ping";
}

export type SSEEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent;
