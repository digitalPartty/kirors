# 凭证创建功能更新说明

## 更新时间
2026-04-11

## 问题分析

### Rust 版本的凭证创建流程

参考 `src/kiro/token_manager.rs` 的 `add_credential` 方法：

```rust
pub async fn add_credential(&self, new_cred: KiroCredentials) -> anyhow::Result<u64> {
    // 1. 基本验证
    validate_refresh_token(&new_cred)?;

    // 2. 尝试刷新 Token 验证凭据有效性
    let mut validated_cred =
        refresh_token(&new_cred, &self.config, self.proxy.as_ref()).await?;

    // 3. 分配新 ID
    let new_id = {
        let entries = self.entries.lock();
        entries.iter().map(|e| e.id).max().unwrap_or(0) + 1
    };

    // 4. 设置 ID 并保留用户输入的元数据
    validated_cred.id = Some(new_id);
    validated_cred.priority = new_cred.priority;
    validated_cred.auth_method = new_cred.auth_method.map(|m| {
        if m.eq_ignore_ascii_case("builder-id") || m.eq_ignore_ascii_case("iam") {
            "idc".to_string()
        } else {
            m
        }
    });
    validated_cred.client_id = new_cred.client_id;
    validated_cred.client_secret = new_cred.client_secret;
    validated_cred.region = new_cred.region;
    validated_cred.machine_id = new_cred.machine_id;

    // 5. 添加到 entries 列表
    {
        let mut entries = self.entries.lock();
        entries.push(CredentialEntry {
            id: new_id,
            credentials: validated_cred,
            failure_count: 0,
            disabled: false,
            disabled_reason: None,
        });
    }

    // 6. 持久化
    self.persist_credentials()?;

    tracing::info!("成功添加凭据 #{}", new_id);
    Ok(new_id)
}
```

### Workers 版本之前缺少的步骤

1. ❌ **Token 刷新验证** - 没有验证 refreshToken 是否有效
2. ❌ **保存 accessToken** - 没有保存刷新后的 accessToken
3. ❌ **保存 expiresAt** - 没有保存 Token 过期时间
4. ❌ **保存 profileArn** - 没有保存 Profile ARN（Social 认证）
5. ❌ **生成 machineId** - 如果用户没有提供，没有自动生成
6. ❌ **refreshToken 长度验证** - 没有检查是否被截断

## 已实现的改进

### 1. 完整的验证流程 ✅

```typescript
// 验证 refreshToken 长度（防止被截断）
if (body.refreshToken.length < 100 || body.refreshToken.includes("...")) {
  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: "validation_error",
        message: "refreshToken 已被截断或无效（长度过短）",
      },
    }),
    { status: 400 }
  );
}
```

### 2. Token 刷新验证 ✅

在保存凭证前，先尝试刷新 Token 验证凭据有效性：

```typescript
// 2. 尝试刷新 Token 验证凭据有效性
try {
  const refreshResult = await testTokenRefresh(tempCredential, env);
  
  accessToken = refreshResult.accessToken;
  expiresAt = refreshResult.expiresAt;
  profileArn = refreshResult.profileArn;
  
} catch (error) {
  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: "validation_error",
        message: `凭据验证失败: ${errorMessage}`,
      },
    }),
    { status: 400 }
  );
}
```

### 3. 支持 Social 和 IdC 两种认证方式 ✅

**Social 认证**:
```typescript
async function refreshSocialToken(
  credential: Credential,
  region: string
): Promise<{ accessToken: string; expiresAt: string; profileArn?: string }> {
  const refreshUrl = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
  
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
    },
    body: JSON.stringify({
      refresh_token: credential.refreshToken,
    }),
  });
  
  // ... 处理响应
}
```

**IdC 认证**:
```typescript
async function refreshIdcToken(
  credential: Credential,
  region: string
): Promise<{ accessToken: string; expiresAt: string; profileArn?: string }> {
  const refreshUrl = `https://oidc.${region}.amazonaws.com/token`;
  
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-amz-user-agent": "aws-sdk-js/3.738.0 ...",
    },
    body: JSON.stringify({
      client_id: credential.clientId,
      client_secret: credential.clientSecret,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  
  // ... 处理响应
}
```

### 4. 自动生成 machineId ✅

如果用户没有提供 machineId，自动生成：

```typescript
function generateMachineId(refreshToken: string): string {
  // 基于 refreshToken 的哈希
  let hash = 0;
  for (let i = 0; i < refreshToken.length; i++) {
    const char = refreshToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
```

### 5. 保存完整的凭证信息 ✅

```typescript
// 创建凭据
const credential = await store.create({
  ...body,
  machineId,
});

// 更新凭据以包含刷新后的 token 信息
await store.update(credential.id, {
  accessToken,
  expiresAt,
  profileArn,
});
```

## 使用示例

### 添加 Social 认证凭据

```bash
curl -X POST "https://kiro-workers.1617402283.workers.dev/api/admin/credentials" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "你的完整-refresh-token（长度应该>100）",
    "authMethod": "social",
    "priority": 3,
    "region": "us-east-1"
  }'
```

### 添加 IdC 认证凭据

```bash
curl -X POST "https://kiro-workers.1617402283.workers.dev/api/admin/credentials" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "你的完整-refresh-token",
    "authMethod": "idc",
    "clientId": "你的-client-id",
    "clientSecret": "你的-client-secret",
    "priority": 2,
    "region": "us-west-2"
  }'
```

### 成功响应

```json
{
  "success": true,
  "message": "凭据 #abc123-xyz789 添加成功",
  "credentialId": "abc123-xyz789"
}
```

### 错误响应示例

#### refreshToken 被截断

```json
{
  "type": "error",
  "error": {
    "type": "validation_error",
    "message": "refreshToken 已被截断或无效（长度过短）"
  }
}
```

#### refreshToken 无效

```json
{
  "type": "error",
  "error": {
    "type": "validation_error",
    "message": "凭据验证失败: Social token refresh failed: 401 Unauthorized"
  }
}
```

#### IdC 缺少必填字段

```json
{
  "type": "error",
  "error": {
    "type": "validation_error",
    "message": "IdC/Builder-ID/IAM 认证需要 clientId 和 clientSecret"
  }
}
```

## 与 Rust 版本的对比

| 功能 | Rust 版本 | Workers 版本（更新前） | Workers 版本（更新后） |
|------|-----------|----------------------|---------------------|
| refreshToken 验证 | ✅ | ✅ | ✅ |
| refreshToken 长度检查 | ✅ | ❌ | ✅ |
| Token 刷新验证 | ✅ | ❌ | ✅ |
| 保存 accessToken | ✅ | ❌ | ✅ |
| 保存 expiresAt | ✅ | ❌ | ✅ |
| 保存 profileArn | ✅ | ❌ | ✅ |
| 生成 machineId | ✅ | ❌ | ✅ |
| Social 认证 | ✅ | ❌ | ✅ |
| IdC 认证 | ✅ | ❌ | ✅ |
| 错误处理 | ✅ | 部分 | ✅ |

## 好处

### 1. 立即验证凭据有效性

添加凭据时就验证 refreshToken 是否有效，避免添加无效凭据。

### 2. 保存完整信息

保存刷新后的 accessToken 和 expiresAt，后续查询余额时可以直接使用，无需再次刷新。

### 3. 更好的错误提示

如果 refreshToken 无效，立即返回详细的错误信息，而不是等到使用时才发现。

### 4. 支持多种认证方式

完整支持 Social 和 IdC 两种认证方式，与 Rust 版本一致。

## 部署

由于网络问题，部署可能需要多次尝试：

```bash
cd workers
npm run deploy
```

如果遇到超时，请重试几次。

## 测试

### 1. 测试 Social 认证

```bash
# 添加凭据
curl -X POST "https://kiro-workers.1617402283.workers.dev/api/admin/credentials" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "你的-refresh-token",
    "authMethod": "social",
    "priority": 3
  }'

# 查看凭据列表
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials"

# 查看余额（验证 accessToken 已保存）
curl -X GET "https://kiro-workers.1617402283.workers.dev/api/admin/credentials/YOUR_ID/balance"
```

### 2. 测试 IdC 认证

```bash
# 添加凭据
curl -X POST "https://kiro-workers.1617402283.workers.dev/api/admin/credentials" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "你的-refresh-token",
    "authMethod": "idc",
    "clientId": "你的-client-id",
    "clientSecret": "你的-client-secret",
    "priority": 2
  }'
```

### 3. 测试错误处理

```bash
# 测试无效的 refreshToken
curl -X POST "https://kiro-workers.1617402283.workers.dev/api/admin/credentials" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "invalid-token",
    "authMethod": "social"
  }'

# 应该返回 400 错误
```

## 注意事项

1. **refreshToken 必须完整** - 长度应该 > 100 字符，不能包含 "..."
2. **IdC 认证需要额外字段** - 必须提供 clientId 和 clientSecret
3. **首次添加会刷新 Token** - 需要网络连接到 AWS 服务
4. **machineId 会自动生成** - 如果没有提供，会基于 refreshToken 生成

## 故障排查

### 问题 1: "refreshToken 已被截断"

**原因**: refreshToken 长度过短或包含 "..."

**解决**: 确保从 Kiro IDE 复制完整的 refreshToken

### 问题 2: "凭据验证失败: 401"

**原因**: refreshToken 无效或已过期

**解决**: 从 Kiro IDE 获取新的 refreshToken

### 问题 3: "IdC 认证需要 clientId 和 clientSecret"

**原因**: 使用 IdC 认证但没有提供必填字段

**解决**: 添加 clientId 和 clientSecret 字段

## 参考

- [Rust 版本实现](../src/kiro/token_manager.rs)
- [Token 管理文档](./TOKEN_MANAGEMENT.md)
- [故障排查指南](./TROUBLESHOOTING.md)

---

**状态**: ✅ 代码已更新，等待部署  
**与 Rust 版本对齐**: ✅ 完全一致
