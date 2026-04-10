/**
 * Kiro API type definitions
 * 
 * These types define the Kiro-specific request and event structures
 * used for communication with the upstream Kiro API.
 */

// === Request Types ===

export interface KiroRequest {
  conversationState: ConversationState;
  profileArn?: string;
}

export interface ConversationState {
  conversationId: string;
  currentMessage: CurrentMessage;
  agentTaskType?: string;
  history?: HistoryMessage[];
}

export interface CurrentMessage {
  userInputMessage: UserInputMessage;
}

export interface UserInputMessage {
  content: string;
  modelId: string;
  userInputMessageContext: UserInputMessageContext;
}

export interface UserInputMessageContext {
  systemPrompt?: SystemPrompt[];
  tools?: KiroTool[];
  thinking?: KiroThinking;
}

export interface SystemPrompt {
  text: string;
}

export interface KiroTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface KiroThinking {
  type: string;
  budgetTokens?: number;
}

export interface HistoryMessage {
  role: string;
  content: KiroContent[];
}

export interface KiroContent {
  type: string;
  text?: string;
  thinking?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  isError?: boolean;
}

// === Event Types ===

export type KiroEvent =
  | AssistantResponseEvent
  | ToolUseEvent
  | ContextUsageEvent
  | MeteringEvent
  | ErrorEvent
  | ExceptionEvent;

export interface AssistantResponseEvent {
  type: "assistantResponseEvent";
  messageStart?: MessageStart;
  contentBlockStart?: ContentBlockStart;
  contentBlockDelta?: ContentBlockDelta;
  contentBlockStop?: ContentBlockStop;
  messageStop?: MessageStop;
}

export interface MessageStart {
  conversationId: string;
  messageId: string;
  role: string;
}

export interface ContentBlockStart {
  blockIndex: number;
  contentBlock: {
    type: string;
    text?: string;
    thinking?: string;
    toolUseId?: string;
    toolName?: string;
  };
}

export interface ContentBlockDelta {
  blockIndex: number;
  delta: {
    type: string;
    text?: string;
    thinking?: string;
    toolInput?: string;
  };
}

export interface ContentBlockStop {
  blockIndex: number;
}

export interface MessageStop {
  stopReason: string;
  additionalModelResponseFields?: {
    stopSequence?: string;
  };
}

export interface ToolUseEvent {
  type: "toolUseEvent";
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
}

export interface ContextUsageEvent {
  type: "contextUsageEvent";
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
}

export interface MeteringEvent {
  type: "meteringEvent";
}

export interface ErrorEvent {
  type: "error";
  errorCode: string;
  errorMessage: string;
}

export interface ExceptionEvent {
  type: "exception";
  exceptionType: string;
  message: string;
}

// === Call Context ===

/**
 * Call context contains credential information for a single API call
 */
export interface CallContext {
  id: string;
  accessToken: string;
  credentials: Credential;
}

// === Credential Types ===

export interface Credential {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  priority: number;
  disabled: boolean;
  failureCount: number;
  lastUsed?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CredentialInput {
  name: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  priority?: number;
}

export interface CredentialBalance {
  total: number;
  used: number;
  remaining: number;
}
