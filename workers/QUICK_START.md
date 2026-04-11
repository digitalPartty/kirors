# 快速开始指南

本指南帮助你快速配置和使用 CF Workers 版本的 Kiro API 代理，包含 Token 自动刷新和失败切换功能。

## 前置条件

- Cloudflare 账户
- Wrangler CLI 已安装
- 至少一个有效的 Kiro 凭据（Refresh Token）

## 步骤 1: 配置凭据

### 方法 A: 使用 Wrangler CLI（推荐）

```bash
# 进入 workers 目录
cd workers

# 添加第一个凭据（Social 认证）
wrangler kv:key put --binding=CREDENTIALS_KV "credential:primary" '{
  "id": "primary",
  "refreshToken": "你的-refresh-token",
  "authMethod": "social",
  "priority": 3,
  "region": "us-east-1",
  "disabled": false,
  "failureCount": 0,
  "createdAt": '$(date +%s000)',
  "updatedAt": '$(date +%s000)'
}'

# 添加备用凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:backup" '{
  "id": "backup",
  "refreshToken": "你的-备用-refresh-token",
  "authMethod": "social",
  "priority": 2,
  "region": "us-west-2",
  "disabled": false,
  "failureCount": 0,
  "createdAt": '$(date +%s000)',
  "updatedAt": '$(date +%s000)'
}'

# 添加凭据列表
wrangler kv:key put --binding=CREDENTIALS_KV "credentials:list" '["primary","backup"]'
```

### 方法 B: 使用 Cloudflare Dashboard

1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages > KV
3. 选择你的 KV 命名空间
4. 添加以下键值对：

**Key**: `credential:primary`  
**Value**:
```json
{
  "id": "primary",
  "refreshToken": "你的-refresh-token",
  "authMethod": "social",
  "priority": 3,
  "region": "us-east-1",
  "disabled": false,
  "failureCount": 0,
  "createdAt": 1712851200000,
  "updatedAt": 1712851200000
}
```

**Key**: `credentials:list`  
**Value**:
```json
["primary", "backup"]
```

## 步骤 2: 测试部署

### 测试基本连接

```bash
curl https://kiro-workers.1617402283.workers.dev/health
```

预期响应：
```json
{
  "status": "ok",
  "timestamp": 1712851200000
}
```

### 测试消息 API

```bash
curl -X POST https://kiro-workers.1617402283.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic.claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Hello! Please respond with a short greeting."
      }
    ]
  }'
```

预期响应：
```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "model": "anthropic.claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 8
  }
}
```

### 测试流式响应

```bash
curl -X POST https://kiro-workers.1617402283.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic.claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "Count from 1 to 5."
      }
    ]
  }'
```

预期响应（SSE 流）：
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","type":"message","role":"assistant"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"1"}}

...
```

## 步骤 3: 查看日志

### 实时日志

```bash
wrangler tail
```

### 过滤日志

```bash
# 只看错误
wrangler tail --status error

# 只看特定时间段
wrangler tail --since 1h
```

### 日志示例

```
[INFO] Token refresh success: credential=primary, attempt=1
[INFO] API call success: credential=primary, messageId=msg_123
[WARN] Token refresh failure: credential=backup, attempt=2, error=401 Unauthorized
[ERROR] Credential failover: from=primary, to=backup, reason=max_failures_reached (3/3)
```

## 步骤 4: 监控凭据状态

### 检查凭据

```bash
# 查看凭据详情
wrangler kv:key get --binding=CREDENTIALS_KV "credential:primary"
```

### 更新凭据

```bash
# 禁用凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:primary" '{
  "id": "primary",
  "refreshToken": "你的-refresh-token",
  "authMethod": "social",
  "priority": 3,
  "region": "us-east-1",
  "disabled": true,
  "failureCount": 0,
  "createdAt": 1712851200000,
  "updatedAt": '$(date +%s000)'
}'

# 重新启用凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:primary" '{
  "id": "primary",
  "refreshToken": "你的-refresh-token",
  "authMethod": "social",
  "priority": 3,
  "region": "us-east-1",
  "disabled": false,
  "failureCount": 0,
  "createdAt": 1712851200000,
  "updatedAt": '$(date +%s000)'
}'
```

## 常见问题

### Q1: 如何获取 Refresh Token？

**A**: Refresh Token 需要从 Kiro IDE 的认证流程中获取。通常在 `~/.kiro/credentials.json` 文件中。

### Q2: 为什么所有请求都返回 503？

**A**: 可能原因：
1. 没有配置凭据
2. 所有凭据都被禁用
3. 所有凭据的 Refresh Token 都已过期

**解决方法**：
```bash
# 检查凭据列表
wrangler kv:key get --binding=CREDENTIALS_KV "credentials:list"

# 检查凭据状态
wrangler kv:key get --binding=CREDENTIALS_KV "credential:primary"

# 重置失败计数
wrangler kv:key put --binding=CREDENTIALS_KV "credential:primary" '{
  ...
  "disabled": false,
  "failureCount": 0,
  ...
}'
```

### Q3: 如何添加 IdC 认证凭据？

**A**: IdC 认证需要额外的 `clientId` 和 `clientSecret`：

```bash
wrangler kv:key put --binding=CREDENTIALS_KV "credential:idc" '{
  "id": "idc",
  "refreshToken": "你的-refresh-token",
  "authMethod": "idc",
  "clientId": "你的-client-id",
  "clientSecret": "你的-client-secret",
  "priority": 1,
  "region": "us-east-1",
  "disabled": false,
  "failureCount": 0,
  "createdAt": '$(date +%s000)',
  "updatedAt": '$(date +%s000)'
}'
```

### Q4: 如何配置不同区域的凭据？

**A**: 每个凭据可以配置独立的 `region`：

```bash
# 美国东部凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:us-east" '{
  "id": "us-east",
  "refreshToken": "...",
  "region": "us-east-1",
  ...
}'

# 欧洲凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:eu" '{
  "id": "eu",
  "refreshToken": "...",
  "region": "eu-west-1",
  ...
}'
```

### Q5: 如何调整凭据优先级？

**A**: 修改 `priority` 字段（数字越大优先级越高）：

```bash
# 高优先级凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:primary" '{
  ...
  "priority": 5,
  ...
}'

# 低优先级凭据
wrangler kv:key put --binding=CREDENTIALS_KV "credential:backup" '{
  ...
  "priority": 1,
  ...
}'
```

## 高级配置

### 配置多个凭据

建议配置 2-3 个凭据以实现高可用：

```bash
# 主凭据（最高优先级）
wrangler kv:key put --binding=CREDENTIALS_KV "credential:primary" '{...}'

# 备用凭据 1
wrangler kv:key put --binding=CREDENTIALS_KV "credential:backup-1" '{...}'

# 备用凭据 2
wrangler kv:key put --binding=CREDENTIALS_KV "credential:backup-2" '{...}'

# 更新凭据列表
wrangler kv:key put --binding=CREDENTIALS_KV "credentials:list" '["primary","backup-1","backup-2"]'
```

### 配置自定义域名

在 `wrangler.toml` 中添加：

```toml
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

然后重新部署：

```bash
npm run deploy
```

### 配置环境变量

在 `wrangler.toml` 中修改：

```toml
[vars]
KIRO_REGION = "us-west-2"  # 修改默认区域
KIRO_VERSION = "0.8.0"
SYSTEM_VERSION = "darwin#24.6.0"
NODE_VERSION = "22.21.1"
```

## 性能优化

### 减少 KV 读取

凭据信息会被 TokenManager Durable Object 缓存，减少 KV 读取次数。

### 使用 CDN 缓存

对于不经常变化的端点（如 `/v1/models`），可以配置 CDN 缓存：

```typescript
return new Response(JSON.stringify(data), {
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
  },
});
```

## 故障排查

### 检查 Worker 状态

```bash
# 查看部署历史
wrangler deployments list

# 查看当前版本
wrangler deployments view
```

### 检查 Durable Object 状态

```bash
# 查看 DO 实例
wrangler durable-objects list TOKEN_MANAGER
```

### 重置 Durable Object

如果 TokenManager 状态异常，可以删除 DO 实例重新初始化：

```bash
# 注意：这会清除所有失败计数和状态
wrangler durable-objects delete TOKEN_MANAGER <instance-id>
```

## 下一步

- 阅读 [Token 管理文档](./TOKEN_MANAGEMENT.md) 了解详细功能
- 查看 [使用示例](./USAGE_EXAMPLE.md) 学习高级用法
- 参考 [实现总结](./IMPLEMENTATION_SUMMARY.md) 了解技术细节

## 获取帮助

- 查看项目文档
- 查看 Cloudflare Workers 文档
- 提交 Issue

---

**祝你使用愉快！** 🚀
