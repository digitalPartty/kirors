# 余额查询功能更新说明

## 更新时间
2026-04-11

## 版本信息
- **Version ID**: c81bd17d-3133-4207-beb5-b50ea6d57e04
- **Worker URL**: https://kiro-workers.1617402283.workers.dev

## 更新内容

### 1. 完整对齐 Rust 版本的响应结构 ✅

#### 新增类型定义

**UsageLimitsResponse** - Kiro API 原始响应
```typescript
interface UsageLimitsResponse {
  nextDateReset?: number;
  subscriptionInfo?: SubscriptionInfo;
  usageBreakdownList: UsageBreakdown[];
}
```

**UsageBreakdown** - 使用量明细
```typescript
interface UsageBreakdown {
  currentUsage: number;
  currentUsageWithPrecision: number;
  bonuses: Bonus[];
  freeTrialInfo?: FreeTrialInfo;
  nextDateReset?: number;
  usageLimit: number;
  usageLimitWithPrecision: number;
}
```

**Bonus** - 奖励额度
```typescript
interface Bonus {
  currentUsage: number;
  usageLimit: number;
  status?: string; // "ACTIVE" | "EXPIRED"
}
```

**FreeTrialInfo** - 免费试用信息
```typescript
interface FreeTrialInfo {
  currentUsage: number;
  currentUsageWithPrecision: number;
  freeTrialExpiry?: number;
  freeTrialStatus?: string; // "ACTIVE" | "EXPIRED"
  usageLimit: number;
  usageLimitWithPrecision: number;
}
```

### 2. 正确计算总额度和使用量 ✅

参考 Rust 版本的逻辑，正确累加：

1. **基础额度**
   - `usageLimitWithPrecision`
   - `currentUsageWithPrecision`

2. **激活的免费试用额度**（如果 `freeTrialStatus === "ACTIVE"`）
   - 额度: `freeTrialInfo.usageLimitWithPrecision`
   - 使用量: `freeTrialInfo.currentUsageWithPrecision`

3. **激活的奖励额度**（如果 `bonus.status === "ACTIVE"`）
   - 额度: `bonus.usageLimit`
   - 使用量: `bonus.currentUsage`

### 3. 改进的错误处理 ✅

- 401: "认证失败，Token 无效或已过期"
- 403: "权限不足，无法获取使用额度"
- 429: "请求过于频繁，已被限流"
- 5xx: "服务器错误，AWS 服务暂时不可用"

### 4. 自动 Token 刷新 ✅

在查询余额前自动检查并刷新过期的 Token。

## 使用示例

### 请求

```bash
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_CREDENTIAL_ID/balance"
```

### 成功响应

```json
{
  "id": "your-credential-id",
  "subscriptionTitle": "KIRO PRO+",
  "currentUsage": 250,
  "usageLimit": 1500,
  "remaining": 1250,
  "usagePercentage": 16.67,
  "nextResetAt": 1712937600000
}
```

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 凭据 ID |
| `subscriptionTitle` | string | 订阅类型（如 "KIRO PRO+", "KIRO FREE"） |
| `currentUsage` | number | 当前总使用量（包含基础+试用+奖励） |
| `usageLimit` | number | 总使用限额（包含基础+试用+奖励） |
| `remaining` | number | 剩余额度 |
| `usagePercentage` | number | 使用百分比（0-100） |
| `nextResetAt` | number | 下次重置时间（Unix 时间戳，毫秒） |

## 计算逻辑示例

假设 Kiro API 返回：

```json
{
  "subscriptionInfo": {
    "subscriptionTitle": "KIRO PRO+"
  },
  "usageBreakdownList": [
    {
      "currentUsageWithPrecision": 200.5,
      "usageLimitWithPrecision": 1000.0,
      "freeTrialInfo": {
        "currentUsageWithPrecision": 30.0,
        "usageLimitWithPrecision": 300.0,
        "freeTrialStatus": "ACTIVE"
      },
      "bonuses": [
        {
          "currentUsage": 19.5,
          "usageLimit": 200.0,
          "status": "ACTIVE"
        }
      ]
    }
  ]
}
```

计算结果：

```javascript
// 总限额 = 基础 + 试用 + 奖励
totalLimit = 1000.0 + 300.0 + 200.0 = 1500.0

// 总使用量 = 基础 + 试用 + 奖励
totalUsage = 200.5 + 30.0 + 19.5 = 250.0

// 剩余额度
remaining = 1500.0 - 250.0 = 1250.0

// 使用百分比
usagePercentage = (250.0 / 1500.0) * 100 = 16.67%
```

返回：

```json
{
  "id": "your-credential-id",
  "subscriptionTitle": "KIRO PRO+",
  "currentUsage": 250,
  "usageLimit": 1500,
  "remaining": 1250,
  "usagePercentage": 16.67,
  "nextResetAt": 1712937600000
}
```

## 测试方法

### 1. 基本测试

```bash
# 查询余额
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_CREDENTIAL_ID/balance"
```

### 2. 查看日志

```bash
# 实时日志
wrangler tail

# 过滤错误
wrangler tail --status error
```

### 3. 验证计算逻辑

如果你有 Kiro IDE，可以对比：

```bash
# Workers 版本
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_ID/balance"

# 本地 Rust 版本（如果运行了）
curl -X GET "http://localhost:8787/api/admin/credentials/YOUR_ID/balance"
```

两者应该返回相同的结果。

## 常见问题

### Q1: 为什么我的 `usageLimit` 比预期大？

**A**: 因为现在正确累加了所有激活的额度：
- 基础订阅额度
- 免费试用额度（如果激活）
- 奖励额度（如果激活）

这与 Kiro IDE 显示的总额度一致。

### Q2: 如何知道我有哪些奖励额度？

**A**: 目前 API 只返回汇总数据。如果需要详细信息，可以：
1. 查看 Kiro IDE 的账户页面
2. 或者修改代码返回完整的 `UsageLimitsResponse`

### Q3: `nextResetAt` 是什么时候？

**A**: 这是你的额度下次重置的时间（Unix 时间戳，毫秒）。通常是每月 1 号。

转换为可读时间：
```javascript
const date = new Date(nextResetAt);
console.log(date.toLocaleString());
```

### Q4: 为什么有时候 `subscriptionTitle` 是空的？

**A**: 某些账户类型可能不返回此字段。这是正常的。

## 与 Rust 版本的对比

| 功能 | Rust 版本 | Workers 版本 | 状态 |
|------|-----------|--------------|------|
| API 端点 | `q.{region}.amazonaws.com/getUsageLimits` | ✅ 相同 | ✅ |
| 请求头 | 完整的 AWS SDK 头 | ✅ 相同 | ✅ |
| 响应解析 | `UsageLimitsResponse` | ✅ 相同 | ✅ |
| 额度计算 | 累加基础+试用+奖励 | ✅ 相同 | ✅ |
| Token 刷新 | 自动刷新 | ✅ 相同 | ✅ |
| 错误处理 | 详细错误信息 | ✅ 相同 | ✅ |

## 技术细节

### 精确值 vs 整数值

Kiro API 返回两种值：
- `currentUsage` / `usageLimit`: 整数值
- `currentUsageWithPrecision` / `usageLimitWithPrecision`: 精确值（浮点数）

我们使用精确值进行计算，然后四舍五入返回整数，确保精度。

### 激活状态判断

只有状态为 `"ACTIVE"` 的额度才会被累加：

```typescript
// 免费试用
if (freeTrialInfo?.freeTrialStatus === "ACTIVE") {
  totalLimit += freeTrialInfo.usageLimitWithPrecision;
  totalUsage += freeTrialInfo.currentUsageWithPrecision;
}

// 奖励
for (const bonus of bonuses) {
  if (bonus.status === "ACTIVE") {
    totalLimit += bonus.usageLimit;
    totalUsage += bonus.currentUsage;
  }
}
```

## 下一步

- [ ] 添加详细余额查询 API（返回完整的 breakdown）
- [ ] 添加余额历史记录
- [ ] 添加余额告警功能

## 参考

- [Rust 版本实现](../src/kiro/token_manager.rs)
- [Rust 版本类型定义](../src/kiro/model/usage_limits.rs)
- [故障排查指南](./TROUBLESHOOTING.md)

---

**部署状态**: ✅ 成功  
**测试状态**: ✅ 已验证  
**与 Rust 版本对齐**: ✅ 完全一致
