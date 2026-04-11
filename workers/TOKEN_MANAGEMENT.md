# Token 管理和自动刷新

本文档说明 CF Workers 版本的 Token 自动刷新机制、失败计数和自动切换功能。

## 功能概述

### 1. Token 自动刷新

TokenManager 会自动检测 Token 过期并刷新，支持两种认证方式：

#### Social 认证（默认）
- **端点**: `https://prod.{region}.auth.desktop.kiro.dev/refreshToken`
- **所需字段**: `refreshToken`
- **可选字段**: `region`（凭据级配置）

#### IdC 认证（AWS SSO OIDC）
- **端点**: `https://oidc.{region}.amazonaws.com/token`
- **所需字段**: `refreshToken`, `clientId`, `clientSecret`
- **可选字段**: `region`（凭据级配置）

### 2. Token 过期检测

- **过期缓冲**: 5 分钟（Token 在 5 分钟内过期视为已过期）
- **刷新阈值**: 10 分钟（Token 在 10 分钟内过期会主动刷新）
- **双重检查锁定**: 防止并发刷新同一 Token

### 3. 失败计数和自动切换

- **失败阈值**: 3 次连续失败
- **自动禁用**: 达到阈值后自动禁用凭据
- **自动切换**: 切换到下一个优先级最高的可用凭据
- **成功重置**: API 调用成功后重置失败计数

### 4. 额度用尽处理

- **触发条件**: 402 Payment Required + `MONTHLY_REQUEST_COUNT`
- **立即禁用**: 不等待失败阈值，立即禁用凭据
- **自动切换**: 切换到下一个可用凭据

## 凭据配置

### Social 认证凭据示例

```json
{
  "id": "cred-1",
  "refreshToken": "your-refresh-token-here",
  "authMethod": "social",
  "priority": 1,
  "region": "us-east-1"
}
```

### IdC 认证凭据示例

```json
{
  "id": "cred-2",
  "refreshToken": "your-refresh-token-here",
  "authMethod": "idc",
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "priority": 2,
  "region": "us-west-2"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 凭据唯一标识符 |
| `refreshToken` | string | 是 | OAuth Refresh Token |
| `authMethod` | string | 否 | 认证方式：`social`（默认）或 `idc` |
| `clientId` | string | IdC 必填 | OIDC Client ID |
| `clientSecret` | string | IdC 必填 | OIDC Client Secret |
| `priority` | number | 否 | 优先级（数字越大优先级越高，默认 0） |
| `region` | string | 否 | AWS 区域（用于 Token 刷新，默认使用全局配置） |
| `disabled` | boolean | 否 | 是否禁用（默认 false） |

## 使用流程

### 1. 初始化 TokenManager

TokenManager 是一个 Durable Object，每个 Worker 实例使用同一个 DO 实例：

```typescript
const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
```

### 2. 获取 API 调用上下文

在发起 API 请求前，先获取 CallContext：

```typescript
const contextResponse = await tokenManager.fetch(
  new Request("http://internal/acquireContext", {
    method: "POST",
  })
);

const context = await contextResponse.json() as CallContext;
// context = { id, accessToken, credentials }
```

`acquireContext` 会自动：
- 选择优先级最高的可用凭据
- 检测 Token 是否过期或即将过期
- 自动刷新 Token（如需要）
- 返回有效的 `accessToken`

### 3. 使用 Access Token 发起请求

```typescript
const response = await fetch(kiroApiUrl, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${context.accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(request),
});
```

### 4. 报告 API 调用结果

#### 成功
```typescript
await tokenManager.fetch(
  new Request("http://internal/reportSuccess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentialId: context.id }),
  })
);
```

#### 失败（401/403 等）
```typescript
await tokenManager.fetch(
  new Request("http://internal/reportFailure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentialId: context.id }),
  })
);
```

#### 额度用尽（402 + MONTHLY_REQUEST_COUNT）
```typescript
const quotaResponse = await tokenManager.fetch(
  new Request("http://internal/reportQuotaExhausted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentialId: context.id }),
  })
);

const { hasAvailable } = await quotaResponse.json();
if (!hasAvailable) {
  // 所有凭据都已用尽
  return new Response("Service Unavailable", { status: 503 });
}
```

## 错误处理

### 检测 MONTHLY_REQUEST_COUNT

```typescript
function isMonthlyRequestLimit(errorText: string): boolean {
  if (errorText.includes("MONTHLY_REQUEST_COUNT")) {
    return true;
  }

  try {
    const errorJson = JSON.parse(errorText);
    return errorJson.reason === "MONTHLY_REQUEST_COUNT" || 
           errorJson.error?.reason === "MONTHLY_REQUEST_COUNT";
  } catch {
    return false;
  }
}
```

### 处理不同的 HTTP 状态码

| 状态码 | 处理方式 | 说明 |
|--------|----------|------|
| 400 | 直接返回错误 | 请求参数问题，不计入失败 |
| 401/403 | `reportFailure()` | 凭据/权限问题，计入失败 |
| 402 + MONTHLY_REQUEST_COUNT | `reportQuotaExhausted()` | 额度用尽，立即禁用 |
| 429/5xx | 重试但不报告失败 | 上游瞬态问题，避免误禁用 |

## 凭据优先级和选择

### 优先级规则

凭据按以下规则排序：
1. **优先级**（`priority`）：数字越大优先级越高
2. **失败次数**（`failureCount`）：失败次数少的优先
3. **禁用状态**（`disabled`）：已禁用的凭据被排除

### 自动切换时机

TokenManager 会在以下情况自动切换凭据：
1. 当前凭据失败次数达到阈值（3 次）
2. 当前凭据额度用尽（402 + MONTHLY_REQUEST_COUNT）
3. 当前凭据 Token 刷新失败

### 示例

假设有 3 个凭据：

```json
[
  { "id": "A", "priority": 3, "failureCount": 0, "disabled": false },
  { "id": "B", "priority": 2, "failureCount": 1, "disabled": false },
  { "id": "C", "priority": 2, "failureCount": 0, "disabled": false }
]
```

选择顺序：
1. **A** - 优先级最高（3）
2. **C** - 优先级 2，失败次数 0
3. **B** - 优先级 2，失败次数 1

## Region 配置优先级

### 配置层级

1. **凭据级 region**（`credential.region`）- 最高优先级
2. **环境变量**（`env.KIRO_REGION`）- 次优先级
3. **默认值**（`"us-east-1"`）- 最低优先级

### 应用场景

- **Token 刷新**: 使用凭据级 region
  - Social: `https://prod.{credential.region}.auth.desktop.kiro.dev/refreshToken`
  - IdC: `https://oidc.{credential.region}.amazonaws.com/token`

- **API 调用**: 使用全局 region（`env.KIRO_REGION`）
  - `https://q.{env.KIRO_REGION}.amazonaws.com/generateAssistantResponse`

### 示例

```json
{
  "id": "cred-eu",
  "refreshToken": "...",
  "region": "eu-west-1",
  "authMethod": "social"
}
```

此凭据的 Token 刷新会使用 `eu-west-1` 区域，但 API 调用仍使用全局配置的区域。

## 监控和日志

### 日志事件

TokenManager 会记录以下事件：

#### Token 刷新
```typescript
logTokenRefresh(credentialId, "success", attempt);
logTokenRefresh(credentialId, "failure", attempt, errorMessage);
```

#### 凭据切换
```typescript
logCredentialFailover(
  fromCredentialId,
  toCredentialId,
  reason,
  failureCount
);
```

### 日志示例

```
[INFO] Token refresh success: credential=cred-1, attempt=1
[WARN] Token refresh failure: credential=cred-2, attempt=2, error=401 Unauthorized
[ERROR] Credential failover: from=cred-1, to=cred-2, reason=max_failures_reached (3/3)
[ERROR] Credential disabled: credential=cred-3, reason=quota_exhausted
```

## 最佳实践

### 1. 配置多个凭据

建议配置至少 2-3 个凭据以实现高可用：

```json
[
  { "id": "primary", "priority": 3, "refreshToken": "..." },
  { "id": "backup-1", "priority": 2, "refreshToken": "..." },
  { "id": "backup-2", "priority": 1, "refreshToken": "..." }
]
```

### 2. 设置合理的优先级

- **生产凭据**: 高优先级（3-5）
- **备用凭据**: 中优先级（1-2）
- **测试凭据**: 低优先级（0）

### 3. 监控凭据状态

定期检查凭据状态，及时处理：
- 失败次数接近阈值的凭据
- 即将过期的 Refresh Token
- 额度即将用尽的凭据

### 4. 处理所有凭据失败的情况

```typescript
try {
  const context = await tokenManager.fetch(...);
} catch (error) {
  // 所有凭据都不可用
  return new Response(
    JSON.stringify({
      error: {
        type: "overloaded_error",
        message: "No available credentials"
      }
    }),
    { status: 503 }
  );
}
```

### 5. 区分瞬态错误和永久错误

- **瞬态错误**（429, 5xx）: 重试但不报告失败
- **永久错误**（401, 403）: 报告失败并切换凭据
- **额度用尽**（402 + MONTHLY_REQUEST_COUNT）: 立即禁用并切换

## 故障排查

### Token 刷新失败

**症状**: 日志显示 Token 刷新失败

**可能原因**:
1. Refresh Token 已过期或无效
2. 网络连接问题
3. AWS 服务暂时不可用
4. IdC 凭据缺少 `clientId` 或 `clientSecret`

**解决方法**:
1. 检查 Refresh Token 是否有效
2. 验证网络连接
3. 检查 AWS 服务状态
4. 确认 IdC 凭据配置完整

### 所有凭据都被禁用

**症状**: API 返回 503 Service Unavailable

**可能原因**:
1. 所有凭据都达到失败阈值
2. 所有凭据额度都已用尽
3. 所有凭据的 Refresh Token 都已过期

**解决方法**:
1. 检查凭据状态和失败原因
2. 重置失败计数（如果是临时问题）
3. 更新 Refresh Token
4. 添加新的凭据

### 凭据频繁切换

**症状**: 日志显示频繁的凭据切换

**可能原因**:
1. 上游 API 不稳定
2. 凭据配置有问题
3. 失败阈值设置过低

**解决方法**:
1. 检查上游 API 状态
2. 验证凭据配置
3. 考虑调整失败阈值（需要修改代码）

## 测试

运行单元测试：

```bash
cd workers
npm test -- token-manager.test.ts
```

测试覆盖：
- ✅ Token 过期检测
- ✅ 凭据优先级选择
- ✅ 失败计数和阈值
- ✅ 额度用尽处理
- ✅ Region 配置优先级
- ✅ 认证方式检测

## 参考

- [Rust 版本实现](../src/kiro/token_manager.rs)
- [实现总结](./IMPLEMENTATION_SUMMARY.md)
- [API 文档](./README.md)
