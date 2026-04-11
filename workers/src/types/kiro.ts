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

/**
 * 凭据信息（与 Rust 版本对齐）
 */
export interface Credential {
  /** 凭据唯一 ID */
  id: string;
  /** Refresh Token（必填） */
  refreshToken: string;
  /** Access Token（可选，会自动刷新） */
  accessToken?: string;
  /** Profile ARN（可选） */
  profileArn?: string;
  /** Token 过期时间（RFC3339 格式） */
  expiresAt?: string;
  /** 认证方式 (social / idc) */
  authMethod?: string;
  /** OIDC Client ID（IdC 认证需要） */
  clientId?: string;
  /** OIDC Client Secret（IdC 认证需要） */
  clientSecret?: string;
  /** 优先级（数字越小优先级越高，默认 0） */
  priority: number;
  /** 是否禁用 */
  disabled: boolean;
  /** 连续失败次数 */
  failureCount: number;
  /** 凭据级 Region 配置（用于 OIDC token 刷新） */
  region?: string;
  /** 凭据级 Machine ID 配置（可选） */
  machineId?: string;
  /** 最后使用时间 */
  lastUsed?: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 添加凭据输入（与 Rust 版本对齐）
 */
export interface CredentialInput {
  /** Refresh Token（必填） */
  refreshToken: string;
  /** 认证方式（可选，默认 social） */
  authMethod?: string;
  /** OIDC Client ID（IdC 认证需要） */
  clientId?: string;
  /** OIDC Client Secret（IdC 认证需要） */
  clientSecret?: string;
  /** 优先级（可选，默认 0） */
  priority?: number;
  /** Region 配置（可选） */
  region?: string;
  /** Machine ID 配置（可选） */
  machineId?: string;
}

/**
 * 凭据余额信息（与 Rust 版本对齐）
 */
export interface CredentialBalance {
  /** 凭据 ID */
  id: string;
  /** 订阅类型 */
  subscriptionTitle?: string;
  /** 当前使用量 */
  currentUsage: number;
  /** 使用限额 */
  usageLimit: number;
  /** 剩余额度 */
  remaining: number;
  /** 使用百分比 */
  usagePercentage: number;
  /** 下次重置时间（Unix 时间戳） */
  nextResetAt?: number;
}

/**
 * Kiro API 使用额度查询响应（与 Rust 版本对齐）
 */
export interface UsageLimitsResponse {
  /** 下次重置日期 (Unix 时间戳) */
  nextDateReset?: number;
  /** 订阅信息 */
  subscriptionInfo?: SubscriptionInfo;
  /** 使用量明细列表 */
  usageBreakdownList: UsageBreakdown[];
}

/**
 * 订阅信息
 */
export interface SubscriptionInfo {
  /** 订阅标题 (KIRO PRO+ / KIRO FREE 等) */
  subscriptionTitle?: string;
}

/**
 * 使用量明细
 */
export interface UsageBreakdown {
  /** 当前使用量 */
  currentUsage: number;
  /** 当前使用量（精确值） */
  currentUsageWithPrecision: number;
  /** 奖励额度列表 */
  bonuses: Bonus[];
  /** 免费试用信息 */
  freeTrialInfo?: FreeTrialInfo;
  /** 下次重置日期 (Unix 时间戳) */
  nextDateReset?: number;
  /** 使用限额 */
  usageLimit: number;
  /** 使用限额（精确值） */
  usageLimitWithPrecision: number;
}

/**
 * 奖励额度
 */
export interface Bonus {
  /** 当前使用量 */
  currentUsage: number;
  /** 使用限额 */
  usageLimit: number;
  /** 状态 (ACTIVE / EXPIRED) */
  status?: string;
}

/**
 * 免费试用信息
 */
export interface FreeTrialInfo {
  /** 当前使用量 */
  currentUsage: number;
  /** 当前使用量（精确值） */
  currentUsageWithPrecision: number;
  /** 免费试用过期时间 (Unix 时间戳) */
  freeTrialExpiry?: number;
  /** 免费试用状态 (ACTIVE / EXPIRED) */
  freeTrialStatus?: string;
  /** 使用限额 */
  usageLimit: number;
  /** 使用限额（精确值） */
  usageLimitWithPrecision: number;
}

/**
 * 凭据状态列表响应（与 Rust 版本对齐）
 */
export interface CredentialsStatusResponse {
  /** 凭据总数 */
  total: number;
  /** 可用凭据数量（未禁用） */
  available: number;
  /** 当前活跃凭据 ID */
  currentId: string;
  /** 各凭据状态列表 */
  credentials: CredentialStatusItem[];
}

/**
 * 单个凭据的状态信息（与 Rust 版本对齐）
 */
export interface CredentialStatusItem {
  /** 凭据唯一 ID */
  id: string;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 是否被禁用 */
  disabled: boolean;
  /** 连续失败次数 */
  failureCount: number;
  /** 是否为当前活跃凭据 */
  isCurrent: boolean;
  /** Token 过期时间（RFC3339 格式） */
  expiresAt?: string;
  /** 认证方式 */
  authMethod?: string;
  /** 是否有 Profile ARN */
  hasProfileArn: boolean;
}
