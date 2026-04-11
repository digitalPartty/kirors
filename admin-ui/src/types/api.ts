// ============ 凭据状态响应 ============

/** 所有凭据状态响应 */
export interface CredentialsStatusResponse {
  /** 凭据总数 */
  total: number
  /** 可用凭据数量（未禁用） */
  available: number
  /** 当前活跃凭据 ID */
  currentId: number
  /** 各凭据状态列表 */
  credentials: CredentialStatusItem[]
}

/** 单个凭据的状态信息 */
export interface CredentialStatusItem {
  /** 凭据唯一 ID */
  id: number
  /** 优先级（数字越小优先级越高） */
  priority: number
  /** 是否被禁用 */
  disabled: boolean
  /** 连续失败次数 */
  failureCount: number
  /** 是否为当前活跃凭据 */
  isCurrent: boolean
  /** Token 过期时间（RFC3339 格式） */
  expiresAt: string | null
  /** 认证方式 (social/idc) */
  authMethod: string | null
  /** 是否有 Profile ARN */
  hasProfileArn: boolean
}

// ============ 余额查询响应 ============

/** 余额查询响应 */
export interface BalanceResponse {
  /** 凭据 ID */
  id: number
  /** 订阅类型 */
  subscriptionTitle: string | null
  /** 当前使用量 */
  currentUsage: number
  /** 使用限额 */
  usageLimit: number
  /** 剩余额度 */
  remaining: number
  /** 使用百分比 */
  usagePercentage: number
  /** 下次重置时间（Unix 时间戳） */
  nextResetAt: number | null
}

// ============ 通用响应 ============

/** 操作成功响应 */
export interface SuccessResponse {
  success: boolean
  message: string
}

/** 错误响应 */
export interface AdminErrorResponse {
  error: {
    type: string
    message: string
  }
}

// ============ 操作请求 ============

/** 启用/禁用凭据请求 */
export interface SetDisabledRequest {
  disabled: boolean
}

/** 修改优先级请求 */
export interface SetPriorityRequest {
  priority: number
}

/** 添加凭据请求 */
export interface AddCredentialRequest {
  /** Refresh Token（必填） */
  refreshToken: string
  /** 认证方式（可选，默认 social） */
  authMethod?: 'social' | 'idc'
  /** OIDC Client ID（IdC 认证需要） */
  clientId?: string
  /** OIDC Client Secret（IdC 认证需要） */
  clientSecret?: string
  /** 优先级（可选，默认 0） */
  priority?: number
  /** 凭据级 Region 配置（用于 OIDC token 刷新） */
  region?: string
}

/** 添加凭据成功响应 */
export interface AddCredentialResponse {
  success: boolean
  message: string
  /** 新添加的凭据 ID */
  credentialId: number
}
