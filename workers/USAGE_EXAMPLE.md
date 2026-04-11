# Token 管理使用示例

本文档提供完整的代码示例，展示如何在 CF Workers 中使用 Token 自动刷新和失败切换功能。

## 完整示例：处理 API 请求

```typescript
import type { Env } from "./types/env";
import type { CallContext } from "./types/kiro";

/**
 * 处理 API 请求的完整示例
 * 包含 Token 管理、错误处理和自动重试
 */
export async function handleApiRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const messageId = generateId("msg");
  
  // 1. 获取 TokenManager 实例
  const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
  const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
  
  // 2. 获取 API 调用上下文（自动刷新 Token）
  let context: CallContext;
  try {
    const contextResponse = await tokenManager.fetch(
      new Request("http://internal/acquireContext", {
        method: "POST",
      })
    );
    
    if (!contextResponse.ok) {
      const errorData = await contextResponse.json() as { error: string };
      throw new Error(errorData.error || "Failed to acquire context");
    }
    
    context = await contextResponse.json() as CallContext;
  } catch (error) {
    console.error("Failed to acquire call context:", error);
    return new Response(
      JSON.stringify({
        error: {
          type: "overloaded_error",
          message: "No available credentials"
        }
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // 3. 发送 API 请求
  const region = env.KIRO_REGION || "us-east-1";
  const apiUrl = `https://q.${region}.amazonaws.com/generateAssistantResponse`;
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.accessToken}`,
        "x-kiro-version": env.KIRO_VERSION || "0.8.0",
      },
      body: JSON.stringify({
        conversationState: {
          conversationId: messageId,
          currentMessage: {
            userInputMessage: {
              content: "Hello, world!",
              modelId: "anthropic.claude-sonnet-4-20250514",
              userInputMessageContext: {},
            },
          },
        },
      }),
    });
    
    // 4. 处理响应
    if (!response.ok) {
      const errorText = await response.text();
      
      // 检查是否为额度用尽
      if (response.status === 402 && isMonthlyRequestLimit(errorText)) {
        console.error(`Credential ${context.id} quota exhausted`);
        
        // 报告额度用尽
        const quotaResponse = await tokenManager.fetch(
          new Request("http://internal/reportQuotaExhausted", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credentialId: context.id }),
          })
        );
        
        const { hasAvailable } = await quotaResponse.json() as { hasAvailable: boolean };
        
        if (!hasAvailable) {
          return new Response(
            JSON.stringify({
              error: {
                type: "overloaded_error",
                message: "All credentials have exhausted their quota"
              }
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        
        // 还有可用凭据，可以重试（这里简化处理，直接返回错误）
        return new Response(
          JSON.stringify({
            error: {
              type: "rate_limit_error",
              message: "Quota exhausted, please retry"
            }
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      
      // 检查是否为认证/权限错误
      if (response.status === 401 || response.status === 403) {
        console.warn(`Credential ${context.id} authentication failed`);
        
        // 报告失败
        await tokenManager.fetch(
          new Request("http://internal/reportFailure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credentialId: context.id }),
          })
        );
        
        return new Response(
          JSON.stringify({
            error: {
              type: "authentication_error",
              message: "Authentication failed"
            }
          }),
          { status: response.status, headers: { "Content-Type": "application/json" } }
        );
      }
      
      // 其他错误
      return new Response(
        JSON.stringify({
          error: {
            type: "api_error",
            message: `API error: ${response.status}`
          }
        }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // 5. 成功 - 报告成功并返回响应
    await tokenManager.fetch(
      new Request("http://internal/reportSuccess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: context.id }),
      })
    );
    
    return response;
    
  } catch (error) {
    console.error("API request failed:", error);
    
    // 报告失败
    await tokenManager.fetch(
      new Request("http://internal/reportFailure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: context.id }),
      })
    );
    
    return new Response(
      JSON.stringify({
        error: {
          type: "api_error",
          message: error instanceof Error ? error.message : "Unknown error"
        }
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * 检查错误是否为月度请求限额用尽
 */
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

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

## 示例：带重试的 API 请求

```typescript
/**
 * 带自动重试的 API 请求
 * 当凭据失败时自动切换到下一个凭据重试
 */
export async function handleApiRequestWithRetry(
  request: Request,
  env: Env,
  maxRetries: number = 3
): Promise<Response> {
  const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
  const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 获取上下文（可能会切换到新凭据）
      const contextResponse = await tokenManager.fetch(
        new Request("http://internal/acquireContext", {
          method: "POST",
        })
      );
      
      if (!contextResponse.ok) {
        const errorData = await contextResponse.json() as { error: string };
        throw new Error(errorData.error || "Failed to acquire context");
      }
      
      const context = await contextResponse.json() as CallContext;
      
      // 发送请求
      const region = env.KIRO_REGION || "us-east-1";
      const apiUrl = `https://q.${region}.amazonaws.com/generateAssistantResponse`;
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${context.accessToken}`,
        },
        body: await request.text(),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // 额度用尽
        if (response.status === 402 && isMonthlyRequestLimit(errorText)) {
          const quotaResponse = await tokenManager.fetch(
            new Request("http://internal/reportQuotaExhausted", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credentialId: context.id }),
            })
          );
          
          const { hasAvailable } = await quotaResponse.json() as { hasAvailable: boolean };
          
          if (!hasAvailable) {
            throw new Error("All credentials exhausted");
          }
          
          // 有可用凭据，继续重试
          lastError = new Error(`Credential ${context.id} quota exhausted`);
          continue;
        }
        
        // 认证错误
        if (response.status === 401 || response.status === 403) {
          await tokenManager.fetch(
            new Request("http://internal/reportFailure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credentialId: context.id }),
            })
          );
          
          // 继续重试（会切换到下一个凭据）
          lastError = new Error(`Credential ${context.id} authentication failed`);
          continue;
        }
        
        // 其他错误直接返回
        return new Response(errorText, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      
      // 成功
      await tokenManager.fetch(
        new Request("http://internal/reportSuccess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        })
      );
      
      return response;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
      
      // 最后一次尝试失败，抛出错误
      if (attempt === maxRetries - 1) {
        break;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  // 所有重试都失败
  return new Response(
    JSON.stringify({
      error: {
        type: "api_error",
        message: lastError?.message || "All retries failed"
      }
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
```

## 示例：流式响应处理

```typescript
/**
 * 处理流式 API 响应
 */
export async function handleStreamingRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
  const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
  
  // 获取上下文
  const contextResponse = await tokenManager.fetch(
    new Request("http://internal/acquireContext", {
      method: "POST",
    })
  );
  
  if (!contextResponse.ok) {
    return new Response("No available credentials", { status: 503 });
  }
  
  const context = await contextResponse.json() as CallContext;
  
  // 创建流式响应
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  // 后台处理流式响应
  (async () => {
    try {
      const region = env.KIRO_REGION || "us-east-1";
      const apiUrl = `https://q.${region}.amazonaws.com/generateAssistantResponse`;
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${context.accessToken}`,
        },
        body: await request.text(),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // 处理错误
        if (response.status === 402 && isMonthlyRequestLimit(errorText)) {
          await tokenManager.fetch(
            new Request("http://internal/reportQuotaExhausted", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credentialId: context.id }),
            })
          );
        } else if (response.status === 401 || response.status === 403) {
          await tokenManager.fetch(
            new Request("http://internal/reportFailure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credentialId: context.id }),
            })
          );
        }
        
        // 发送错误事件
        const errorEvent = `event: error\ndata: ${JSON.stringify({
          error: {
            type: "api_error",
            message: `API error: ${response.status}`
          }
        })}\n\n`;
        await writer.write(encoder.encode(errorEvent));
        await writer.close();
        return;
      }
      
      // 流式传输响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          await writer.write(value);
        }
        
        // 成功
        await tokenManager.fetch(
          new Request("http://internal/reportSuccess", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credentialId: context.id }),
          })
        );
      } finally {
        reader.releaseLock();
      }
      
    } catch (error) {
      console.error("Streaming error:", error);
      
      // 报告失败
      await tokenManager.fetch(
        new Request("http://internal/reportFailure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credentialId: context.id }),
        })
      );
      
      // 发送错误事件
      const errorEvent = `event: error\ndata: ${JSON.stringify({
        error: {
          type: "api_error",
          message: error instanceof Error ? error.message : "Unknown error"
        }
      })}\n\n`;
      await writer.write(encoder.encode(errorEvent));
    } finally {
      await writer.close();
    }
  })();
  
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

## 示例：凭据配置

### 配置文件示例（KV 存储）

```json
[
  {
    "id": "prod-primary",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "authMethod": "social",
    "priority": 3,
    "region": "us-east-1",
    "disabled": false
  },
  {
    "id": "prod-backup",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "authMethod": "social",
    "priority": 2,
    "region": "us-west-2",
    "disabled": false
  },
  {
    "id": "idc-credential",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "authMethod": "idc",
    "clientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
    "clientSecret": "yyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    "priority": 1,
    "region": "eu-west-1",
    "disabled": false
  }
]
```

### 初始化凭据到 KV

```typescript
/**
 * 初始化凭据到 KV 存储
 */
export async function initializeCredentials(env: Env) {
  const credentials = [
    {
      id: "prod-primary",
      refreshToken: process.env.REFRESH_TOKEN_1!,
      authMethod: "social",
      priority: 3,
      region: "us-east-1",
      disabled: false,
      failureCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "prod-backup",
      refreshToken: process.env.REFRESH_TOKEN_2!,
      authMethod: "social",
      priority: 2,
      region: "us-west-2",
      disabled: false,
      failureCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  
  // 存储到 KV
  for (const credential of credentials) {
    await env.CREDENTIALS_KV.put(
      `credential:${credential.id}`,
      JSON.stringify(credential)
    );
  }
  
  // 存储凭据列表
  await env.CREDENTIALS_KV.put(
    "credentials:list",
    JSON.stringify(credentials.map(c => c.id))
  );
  
  console.log(`Initialized ${credentials.length} credentials`);
}
```

## 运行示例

### 本地开发

```bash
cd workers
npm install
npm run dev
```

### 部署到 Cloudflare

```bash
npm run deploy
```

### 测试

```bash
# 测试 API 请求
curl -X POST http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic.claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Hello, world!"
      }
    ]
  }'
```

## 参考

- [Token 管理文档](./TOKEN_MANAGEMENT.md)
- [实现总结](./IMPLEMENTATION_SUMMARY.md)
- [API 文档](./README.md)
