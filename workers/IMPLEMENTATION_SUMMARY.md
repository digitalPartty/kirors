# CF Workers 核心功能实现总结

## 已实现的功能

### 1. Token 自动刷新机制 ✅

#### Social 认证刷新
- **位置**: `workers/src/durable-objects/token-manager.ts` - `refreshSocialToken()`
- **功能**:
  - 使用 `https://prod.{region}.auth.desktop.kiro.dev/refreshToken` 端点
  - 支持凭据级 region 配置（优先使用 `credential.region`，回退到 `env.KIRO_REGION`）
  - 自动更新 `accessToken`, `refreshToken`, `profileArn`, `expiresAt`
  - 持久化到 KV 存储
  - 3 次重试机制，指数退避（1s, 2s）

#### IdC (AWS SSO OIDC) 认证刷新
- **位置**: `workers/src/durable-objects/token-manager.ts` - `refreshIdcToken()`
- **功能**:
  - 使用 `https://oidc.{region}.amazonaws.com/token` 端点
  - 需要 `clientId` 和 `clientSecret`
  - 支持凭据级 region 配置
  - 符合 AWS SDK 规范的请求头（`x-amz-user-agent` 等）
  - 自动更新 token 并持久化
  - 3 次重试机制

#### Token 过期检测
- **位置**: `workers/src/durable-objects/token-manager.ts`
- **常量**:
  - `TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000` (5分钟)
  - `TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000` (10分钟)
- **逻辑**:
  - Token 在 5 分钟内过期视为已过期
  - Token 在 10 分钟内过期会主动刷新
  - 使用双重检查锁定（DCL）避免并发刷新

### 2. 失败计数和自动切换 ✅

#### 失败计数机制
- **位置**: `workers/src/durable-objects/token-manager.ts` - `reportFailure()`
- **阈值**: `MAX_FAILURES_PER_CREDENTIAL = 3`
- **行为**:
  - 每次 API 调用失败时增加 `failureCount`
  - 达到阈值后自动禁用凭据（`disabled = true`）
  - 持久化失败计数到 Durable Object 存储
  - 自动切换到下一个优先级最高的可用凭据

#### 成功重置
- **位置**: `workers/src/durable-objects/token-manager.ts` - `reportSuccess()`
- **行为**:
  - API 调用成功后重置 `failureCount = 0`
  - 确保临时故障不会导致凭据被禁用

#### 额度用尽处理
- **位置**: `workers/src/durable-objects/token-manager.ts` - `reportQuotaExhausted()`
- **触发条件**: 402 Payment Required + `MONTHLY_REQUEST_COUNT`
- **行为**:
  - 立即禁用凭据（不等待失败阈值）
  - 设置 `failureCount = MAX_FAILURES_PER_CREDENTIAL` 便于管理面板显示
  - 自动切换到下一个可用凭据
  - 记录日志 `quota_exhausted`

### 3. API 转发逻辑 ✅

#### 请求转发
- **位置**: `workers/src/handlers/messages.ts`
- **流程**:
  1. 从 TokenManager 获取 `CallContext`（包含 `id`, `accessToken`, `credentials`）
  2. 构建 Kiro API 请求（转换 Anthropic 格式到 Kiro 格式）
  3. 添加认证头 `Authorization: Bearer {accessToken}`
  4. 发送请求到 `https://q.{region}.amazonaws.com/generateAssistantResponse`
  5. 处理响应（流式或非流式）

#### 错误处理和自动切换
- **位置**: `workers/src/handlers/messages.ts`
- **支持的错误类型**:

##### 400 Bad Request
- **行为**: 直接返回错误，不计入凭据失败
- **原因**: 请求参数问题，切换凭据无意义

##### 401/403 认证/权限错误
- **行为**: 调用 `reportFailure()`，计入失败次数
- **原因**: 凭据可能无效，允许故障转移

##### 402 额度用尽
- **检测**: `isMonthlyRequestLimit()` 检查响应中是否包含 `MONTHLY_REQUEST_COUNT`
- **行为**: 调用 `reportQuotaExhausted()`，立即禁用并切换
- **实现**:
  ```typescript
  if (kiroResponse.status === 402 && isMonthlyRequestLimit(errorText)) {
    const quotaResponse = await tokenManager.fetch(
      new Request("http://internal/reportQuotaExhausted", {
        method: "POST",
        body: JSON.stringify({ credentialId: context.id }),
      })
    );
    const { hasAvailable } = await quotaResponse.json();
    if (!hasAvailable) {
      return createCredentialExhaustedError("All credentials have exhausted their quota");
    }
  }
  ```

##### 429/5xx 瞬态错误
- **行为**: 重试但不禁用凭据
- **原因**: 上游临时问题，避免误禁用所有凭据

### 4. Durable Objects 集成 ✅

#### TokenManager Durable Object
- **位置**: `workers/src/durable-objects/token-manager.ts`
- **状态管理**:
  - `credentials: Map<string, CredentialEntry>` - 凭据列表（内存）
  - `currentCredentialId: string | null` - 当前活跃凭据 ID
  - `failureCounts: Record<string, number>` - 失败计数（持久化到 DO 存储）
  - `refresh_lock: TokioMutex` - Token 刷新锁（防止并发刷新）

#### RPC 接口
- **位置**: `workers/src/durable-objects/token-manager.ts` - `fetch()`
- **端点**:
  - `POST /acquireContext` - 获取 API 调用上下文
  - `POST /reportSuccess` - 报告成功
  - `POST /reportFailure` - 报告失败
  - `POST /reportQuotaExhausted` - 报告额度用尽

#### 分布式锁
- **实现**: 使用 `TokioMutex` 确保同一时间只有一个 Token 刷新操作
- **双重检查锁定**:
  ```typescript
  // 第一次检查（无锁）
  if (needsRefresh) {
    const _guard = await this.refresh_lock.lock();
    // 第二次检查（持锁）
    const current = await this.getCredential(id);
    if (stillNeedsRefresh(current)) {
      await this.refreshToken(current);
    }
  }
  ```

### 5. 凭据优先级和选择策略 ✅

#### 优先级规则
- **位置**: `workers/src/durable-objects/token-manager.ts` - `selectHighestPriorityCredential()`
- **排序**:
  1. 按 `priority` 降序（数字越大优先级越高）
  2. 按 `failureCount` 升序（失败次数少的优先）
- **过滤**: 排除 `disabled = true` 的凭据

#### 自动切换
- **位置**: `workers/src/durable-objects/token-manager.ts` - `selectNextCredential()`
- **触发条件**:
  - 当前凭据失败次数达到阈值
  - 当前凭据额度用尽
  - Token 刷新失败
- **行为**:
  - 选择下一个优先级最高的可用凭据
  - 更新 `currentCredentialId`
  - 持久化到 DO 存储
  - 记录日志

### 6. 凭据级 Region 支持 ✅

#### 配置优先级
- **规则**: `credential.region` > `env.KIRO_REGION` > `"us-east-1"`
- **应用场景**:
  - Social Token 刷新: `https://prod.{region}.auth.desktop.kiro.dev/refreshToken`
  - IdC Token 刷新: `https://oidc.{region}.amazonaws.com/token`
- **API 调用**: 仍使用全局 `env.KIRO_REGION`（不受凭据级 region 影响）

## 与 Rust 版本的对齐

### 数据结构对齐 ✅
- `Credential` 类型包含所有 Rust 版本字段
- `CallContext` 结构一致
- `CredentialEntry` 内部状态对齐

### 功能对齐 ✅
- Token 自动刷新（Social + IdC）
- 失败计数和自动切换
- 额度用尽立即禁用
- 双重检查锁定防止并发刷新
- 凭据级 region 配置

### 行为对齐 ✅
- 失败阈值: 3 次
- Token 过期缓冲: 5 分钟
- Token 刷新阈值: 10 分钟
- 重试次数: 3 次
- 指数退避: 1s, 2s

## 测试建议

### 单元测试
1. Token 过期检测逻辑
2. 失败计数和阈值触发
3. 优先级排序算法
4. 额度用尽立即禁用
5. Region 配置优先级

### 集成测试
1. Social Token 刷新流程
2. IdC Token 刷新流程
3. 多凭据故障转移
4. 并发请求下的 Token 刷新
5. 402 错误自动切换

### 端到端测试
1. 完整的 API 请求流程
2. 流式响应处理
3. 错误恢复和重试
4. 所有凭据失败的场景

## 部署注意事项

### 环境变量
- `KIRO_REGION`: 默认 AWS 区域
- `KIRO_VERSION`: Kiro IDE 版本
- `SYSTEM_VERSION`: 系统版本
- `NODE_VERSION`: Node.js 版本

### KV 命名空间
- `CREDENTIALS_KV`: 存储凭据信息

### Durable Objects
- `TOKEN_MANAGER`: Token 管理器实例

### Wrangler 配置
确保 `wrangler.toml` 包含:
```toml
[[durable_objects.bindings]]
name = "TOKEN_MANAGER"
class_name = "TokenManager"
script_name = "kiro-api-proxy"

[[kv_namespaces]]
binding = "CREDENTIALS_KV"
id = "your-kv-namespace-id"
```

## 下一步工作

### 可选增强
1. **自愈机制**: 当所有凭据因失败被禁用时，自动重置失败计数（类似 Rust 版本）
2. **指标收集**: 记录 Token 刷新次数、失败率、切换频率
3. **管理 API**: 实现凭据的增删改查接口
4. **健康检查**: 定期检查凭据状态和 Token 有效性
5. **告警机制**: 当可用凭据数量低于阈值时发送告警

### 性能优化
1. **缓存优化**: 减少 KV 读取次数
2. **批量操作**: 支持批量更新凭据状态
3. **连接池**: 复用 HTTP 连接
4. **并发控制**: 限制并发刷新请求数量
