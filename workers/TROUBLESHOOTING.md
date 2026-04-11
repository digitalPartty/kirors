# 故障排查指南

## 查看余额报错

### 问题描述
新增账号后，查看余额时返回错误。

### 已修复的问题

#### 1. API URL 错误 ✅
**问题**: 使用了错误的 API 端点
- **错误**: `https://api.kiro.{region}.aws.dev/usageLimits`
- **正确**: `https://q.{region}.amazonaws.com/getUsageLimits`

**修复**: 已更新为正确的 Kiro API 端点（与 Rust 版本对齐）

#### 2. 缺少必要的请求头 ✅
**问题**: 缺少 Kiro API 要求的特定请求头
- `x-amz-user-agent`
- `amz-sdk-invocation-id`
- `amz-sdk-request`

**修复**: 已添加所有必需的请求头

#### 3. Token 未刷新 ✅
**问题**: 新增的凭据可能没有 `accessToken`，或 token 已过期

**修复**: 在查询余额前自动检查并刷新 token

### 如何测试

#### 1. 查看凭据详情
```bash
# 查看凭据是否存在
wrangler kv:key get --binding=CREDENTIALS_KV "credential:你的凭据ID"
```

#### 2. 测试余额查询
```bash
# 替换 YOUR_CREDENTIAL_ID 为你的凭据 ID
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_CREDENTIAL_ID/balance" \
  -H "Content-Type: application/json"
```

#### 3. 查看实时日志
```bash
wrangler tail
```

### 常见错误和解决方法

#### 错误 1: "凭据不存在"
**原因**: 凭据 ID 不正确或凭据未正确保存到 KV

**解决方法**:
```bash
# 1. 检查凭据列表
wrangler kv:key get --binding=CREDENTIALS_KV "credentials:list"

# 2. 检查具体凭据
wrangler kv:key get --binding=CREDENTIALS_KV "credential:你的凭据ID"

# 3. 如果不存在，重新添加
wrangler kv:key put --binding=CREDENTIALS_KV "credential:你的凭据ID" '{
  "id": "你的凭据ID",
  "refreshToken": "你的-refresh-token",
  "authMethod": "social",
  "priority": 3,
  "region": "us-east-1",
  "disabled": false,
  "failureCount": 0,
  "createdAt": '$(date +%s000)',
  "updatedAt": '$(date +%s000)'
}'
```

#### 错误 2: "凭据缺少 Access Token"
**原因**: 新添加的凭据没有 `accessToken`

**解决方法**: 
- 已自动修复：系统会自动使用 TokenManager 刷新 token
- 如果仍然失败，检查 `refreshToken` 是否有效

#### 错误 3: "Kiro API 返回 401"
**原因**: `refreshToken` 无效或已过期

**解决方法**:
```bash
# 1. 从 Kiro IDE 获取新的 refreshToken
# 通常在 ~/.kiro/credentials.json 文件中

# 2. 更新凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:你的凭据ID" '{
  "id": "你的凭据ID",
  "refreshToken": "新的-refresh-token",
  ...
}'
```

#### 错误 4: "Kiro API 返回 403"
**原因**: 权限不足或 profileArn 不正确

**解决方法**:
```bash
# 检查凭据中的 profileArn 是否正确
wrangler kv:key get --binding=CREDENTIALS_KV "credential:你的凭据ID"

# 如果 profileArn 不正确，更新它
wrangler kv:key put --binding=CREDENTIALS_KV "credential:你的凭据ID" '{
  ...
  "profileArn": "正确的-profile-arn",
  ...
}'
```

#### 错误 5: "查询余额失败"
**原因**: 网络问题或 Kiro API 暂时不可用

**解决方法**:
```bash
# 1. 查看详细日志
wrangler tail

# 2. 稍后重试
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_CREDENTIAL_ID/balance"

# 3. 检查 Kiro API 状态
# 访问 AWS 服务健康仪表板
```

### 调试步骤

#### 步骤 1: 验证凭据存在
```bash
# 查看所有凭据
wrangler kv:key list --binding=CREDENTIALS_KV --prefix="credential:"

# 查看凭据列表
wrangler kv:key get --binding=CREDENTIALS_KV "credentials:list"
```

#### 步骤 2: 检查凭据内容
```bash
# 查看凭据详情
wrangler kv:key get --binding=CREDENTIALS_KV "credential:你的凭据ID"

# 确认以下字段存在且正确：
# - id
# - refreshToken (长度应该 > 100)
# - authMethod (social 或 idc)
# - region (可选)
# - profileArn (可选)
```

#### 步骤 3: 测试 Token 刷新
```bash
# 查看实时日志
wrangler tail

# 在另一个终端测试余额查询
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_CREDENTIAL_ID/balance"

# 观察日志中的 Token 刷新信息
# 应该看到类似：
# [INFO] Token refresh success: credential=xxx, attempt=1
```

#### 步骤 4: 检查 API 响应
```bash
# 使用 -v 查看详细响应
curl -v -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_CREDENTIAL_ID/balance"

# 检查响应状态码和错误信息
```

### 成功的响应示例

```json
{
  "id": "your-credential-id",
  "subscriptionTitle": "Kiro Pro",
  "currentUsage": 250,
  "usageLimit": 1000,
  "remaining": 750,
  "usagePercentage": 25,
  "nextResetAt": 1712937600000
}
```

### 错误响应示例

```json
{
  "type": "error",
  "error": {
    "type": "not_found_error",
    "message": "凭据不存在"
  }
}
```

```json
{
  "type": "error",
  "error": {
    "type": "internal_error",
    "message": "Kiro API 返回 401: Unauthorized"
  }
}
```

### 完整的测试流程

```bash
# 1. 添加凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:test-cred" '{
  "id": "test-cred",
  "refreshToken": "你的-refresh-token",
  "authMethod": "social",
  "priority": 3,
  "region": "us-east-1",
  "disabled": false,
  "failureCount": 0,
  "createdAt": '$(date +%s000)',
  "updatedAt": '$(date +%s000)'
}'

# 2. 更新凭据列表
wrangler kv:key put --binding=CREDENTIALS_KV "credentials:list" '["test-cred"]'

# 3. 启动日志监控
wrangler tail &

# 4. 测试余额查询
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/test-cred/balance"

# 5. 检查响应和日志
```

### 获取帮助

如果以上方法都无法解决问题：

1. **收集信息**:
   - 凭据 ID
   - 错误消息
   - 日志输出（`wrangler tail`）
   - 凭据配置（隐藏敏感信息）

2. **检查文档**:
   - [Token 管理文档](./TOKEN_MANAGEMENT.md)
   - [快速开始指南](./QUICK_START.md)
   - [使用示例](./USAGE_EXAMPLE.md)

3. **常见问题**:
   - 确保 `refreshToken` 完整且未被截断
   - 确保 `refreshToken` 未过期
   - 确保网络可以访问 AWS 服务
   - 确保 Cloudflare Workers 配置正确

### 预防措施

1. **定期检查凭据状态**:
   ```bash
   # 每天检查一次
   curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_ID/balance"
   ```

2. **配置多个凭据**:
   - 至少配置 2-3 个凭据
   - 设置不同的优先级
   - 确保有备用凭据

3. **监控日志**:
   ```bash
   # 持续监控
   wrangler tail --format pretty
   ```

4. **设置告警**:
   - 监控 API 错误率
   - 监控凭据失败次数
   - 监控余额使用情况

---

**最后更新**: 2026-04-11  
**版本**: 2092e35d-1fc8-442a-89ef-9f26c54c0e83
