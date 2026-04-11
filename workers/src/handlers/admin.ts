/**
 * Admin API 处理器
 * 
 * 提供管理员凭据管理端点。
 * 所有端点都需要 Admin API Key 认证。
 * 
 * **验证: 需求 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7**
 */

import type { Env } from "../types";
import type { 
  Credential, 
  CredentialInput, 
  CredentialBalance, 
  CredentialsStatusResponse,
  UsageLimitsResponse,
  UsageBreakdown,
  Bonus,
  FreeTrialInfo
} from "../types/kiro";
import { CredentialStore } from "../storage";
import { logError } from "../utils/logger";

/**
 * GET /api/admin/credentials
 * 
 * 列出所有凭据及其当前状态。
 * 
 * **验证: 需求 12.1**
 */
export async function handleListCredentials(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const response = await store.list();

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "列出凭据时出错");
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "获取凭据列表失败",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials
 * 
 * 创建新凭据。
 * 
 * **验证: 需求 12.2**
 * 
 * 流程（与 Rust 版本对齐）：
 * 1. 验证凭据基本字段（refreshToken 不为空）
 * 2. 尝试刷新 Token 验证凭据有效性
 * 3. 生成 ID 和 machineId
 * 4. 保存凭据（包含刷新后的 accessToken）
 */
export async function handleCreateCredential(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json() as CredentialInput;

    // 1. 验证必填字段
    if (!body.refreshToken) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "缺少必填字段: refreshToken",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

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
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // IdC 认证需要额外字段
    const authMethod = body.authMethod?.toLowerCase() || "social";
    if ((authMethod === 'idc' || authMethod === 'builder-id' || authMethod === 'iam') && 
        (!body.clientId || !body.clientSecret)) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "IdC/Builder-ID/IAM 认证需要 clientId 和 clientSecret",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 2. 尝试刷新 Token 验证凭据有效性（与 Rust 版本对齐）
    let accessToken: string | undefined;
    let expiresAt: string | undefined;
    let profileArn: string | undefined;

    try {
      // 使用 TokenManager 的刷新逻辑
      const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
      const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
      
      // 创建临时凭据用于测试刷新
      const tempCredential: Credential = {
        id: "temp",
        refreshToken: body.refreshToken,
        authMethod: body.authMethod || "social",
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        priority: body.priority ?? 0,
        disabled: false,
        failureCount: 0,
        region: body.region,
        machineId: body.machineId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 通过内部 API 测试刷新（这里我们需要直接调用刷新逻辑）
      // 由于 TokenManager 不暴露直接刷新接口，我们需要手动实现
      const refreshResult = await testTokenRefresh(tempCredential, env);
      
      accessToken = refreshResult.accessToken;
      expiresAt = refreshResult.expiresAt;
      profileArn = refreshResult.profileArn;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Token 刷新失败";
      
      logError(error, "验证凭据时 Token 刷新失败");
      
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: `凭据验证失败: ${errorMessage}`,
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 3. 生成 machineId（如果没有提供）
    const machineId = body.machineId || generateMachineId(body.refreshToken);

    // 4. 创建凭据（包含刷新后的 token）
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const credential = await store.create({
      ...body,
      machineId,
    });

    // 5. 更新凭据以包含刷新后的 token 信息
    await store.update(credential.id, {
      accessToken,
      expiresAt,
      profileArn,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `凭据 #${credential.id} 添加成功`,
        credentialId: credential.id,
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logError(error, "创建凭据时出错");
    
    const errorMessage = error instanceof Error ? error.message : "创建凭据失败";
    
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: errorMessage,
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * 测试 Token 刷新（验证凭据有效性）
 */
async function testTokenRefresh(
  credential: Credential,
  env: Env
): Promise<{ accessToken: string; expiresAt: string; profileArn?: string }> {
  const authMethod = credential.authMethod?.toLowerCase() || "social";
  const region = credential.region || env.KIRO_REGION || "us-east-1";
  
  if (authMethod === "idc" || authMethod === "builder-id" || authMethod === "iam") {
    return refreshIdcToken(credential, region);
  } else {
    return refreshSocialToken(credential, region);
  }
}

/**
 * 刷新 Social Token
 */
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Social token refresh failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    profile_arn?: string;
    expires_in?: number;
  };

  const now = Date.now();
  const expiresAt = data.expires_in 
    ? new Date(now + data.expires_in * 1000).toISOString()
    : new Date(now + 3600 * 1000).toISOString();

  return {
    accessToken: data.access_token,
    expiresAt,
    profileArn: data.profile_arn,
  };
}

/**
 * 刷新 IdC Token
 */
async function refreshIdcToken(
  credential: Credential,
  region: string
): Promise<{ accessToken: string; expiresAt: string; profileArn?: string }> {
  if (!credential.clientId || !credential.clientSecret) {
    throw new Error("IdC refresh requires clientId and clientSecret");
  }

  const refreshUrl = `https://oidc.${region}.amazonaws.com/token`;
  
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-amz-user-agent": "aws-sdk-js/3.738.0 ua/2.1 os/other lang/js md/browser#unknown_unknown api/sso-oidc#3.738.0 m/E KiroIDE",
    },
    body: JSON.stringify({
      client_id: credential.clientId,
      client_secret: credential.clientSecret,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`IdC token refresh failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const now = Date.now();
  const expiresAt = data.expires_in 
    ? new Date(now + data.expires_in * 1000).toISOString()
    : new Date(now + 3600 * 1000).toISOString();

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

/**
 * 生成 machineId（基于 refreshToken 的哈希）
 */
function generateMachineId(refreshToken: string): string {
  // 简单的哈希函数（与 Rust 版本类似）
  let hash = 0;
  for (let i = 0; i < refreshToken.length; i++) {
    const char = refreshToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * DELETE /api/admin/credentials/:id
 * 
 * 删除凭据。
 * 
 * **验证: 需求 12.3**
 */
export async function handleDeleteCredential(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const deleted = await store.delete(credentialId);

    if (!deleted) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "凭据不存在",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `凭据 #${credentialId} 已删除`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logError(error, "删除凭据时出错", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "删除凭据失败",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials/:id/disabled
 * 
 * 切换凭据禁用状态。
 * 
 * **验证: 需求 12.4**
 */
export async function handleToggleDisabled(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const body = await request.json() as { disabled: boolean };

    if (typeof body.disabled !== "boolean") {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "字段 'disabled' 必须是布尔值",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const store = new CredentialStore(env.CREDENTIALS_KV);
    const updated = await store.update(credentialId, {
      disabled: body.disabled,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "凭据不存在",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const action = body.disabled ? "已禁用" : "已启用";
    return new Response(
      JSON.stringify({
        success: true,
        message: `凭据 #${credentialId} ${action}`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logError(error, "切换禁用状态时出错", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "更新凭据失败",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials/:id/priority
 * 
 * 更新凭据优先级。
 * 
 * **验证: 需求 12.5**
 */
export async function handleUpdatePriority(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const body = await request.json() as { priority: number };

    if (typeof body.priority !== "number") {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "validation_error",
            message: "字段 'priority' 必须是数字",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const store = new CredentialStore(env.CREDENTIALS_KV);
    const updated = await store.update(credentialId, {
      priority: body.priority,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "凭据不存在",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `凭据 #${credentialId} 优先级已设置为 ${body.priority}`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logError(error, "更新优先级时出错", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "更新凭据失败",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * POST /api/admin/credentials/:id/reset
 * 
 * 重置凭据失败计数。
 * 
 * **验证: 需求 12.6**
 */
export async function handleResetFailures(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    const updated = await store.update(credentialId, {
      failureCount: 0,
    });

    if (!updated) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "凭据不存在",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `凭据 #${credentialId} 失败计数已重置并重新启用`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    logError(error, "重置失败计数时出错", undefined, credentialId);
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: "重置失败计数失败",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * GET /api/admin/credentials/:id/balance
 * 
 * 从 Kiro API 查询凭据使用配额。
 * 
 * **验证: 需求 12.7, 19.1, 19.2**
 */
export async function handleGetBalance(
  request: Request,
  env: Env,
  credentialId: string
): Promise<Response> {
  try {
    const store = new CredentialStore(env.CREDENTIALS_KV);
    let credential = await store.get(credentialId);

    if (!credential) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "not_found_error",
            message: "凭据不存在",
          },
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 如果没有 accessToken 或 token 已过期，通过 TokenManager 刷新
    const needsRefresh = !credential.accessToken || isTokenExpired(credential.expiresAt);
    
    if (needsRefresh) {
      try {
        // 使用 TokenManager 获取有效的 token
        const tokenManagerId = env.TOKEN_MANAGER.idFromName("default");
        const tokenManager = env.TOKEN_MANAGER.get(tokenManagerId);
        
        const contextResponse = await tokenManager.fetch(
          new Request("http://internal/acquireContext", {
            method: "POST",
          })
        );
        
        if (contextResponse.ok) {
          const context = await contextResponse.json() as { id: string; accessToken: string; credentials: Credential };
          
          // 如果返回的是同一个凭据，使用刷新后的 token
          if (context.id === credentialId) {
            credential = context.credentials;
          }
        }
      } catch (error) {
        logError(error, "刷新 Token 失败", undefined, credentialId);
        // 继续尝试使用现有 token
      }
    }

    // 查询 Kiro API 获取余额信息
    const balance = await queryKiroBalance(credential, env);

    return new Response(JSON.stringify(balance), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    logError(error, "查询余额时出错", undefined, credentialId);
    
    const errorMessage = error instanceof Error ? error.message : "查询余额失败";
    
    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_error",
          message: errorMessage,
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

/**
 * 检查 Token 是否已过期
 */
function isTokenExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return true;
  }
  
  try {
    const expiresAtMs = new Date(expiresAt).getTime();
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 分钟缓冲
    
    return expiresAtMs <= now + bufferMs;
  } catch {
    return true;
  }
}

/**
 * 查询 Kiro API 获取凭据余额
 * 
 * 向 Kiro API 发起请求以获取使用配额信息。
 * 
 * @param credential - 要查询的凭据
 * @param env - 环境绑定
 * @returns 余额信息
 */
async function queryKiroBalance(
  credential: Credential,
  env: Env
): Promise<CredentialBalance> {
  // 使用全局 region（API 调用使用全局配置，不使用凭据级 region）
  const region = env.KIRO_REGION || "us-east-1";
  const host = `q.${region}.amazonaws.com`;
  
  // 构建 URL（参考 Rust 版本的实现）
  let url = `https://${host}/getUsageLimits?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST`;
  
  // profileArn 是可选的
  if (credential.profileArn) {
    url += `&profileArn=${encodeURIComponent(credential.profileArn)}`;
  }

  // 如果没有 accessToken，需要先刷新
  if (!credential.accessToken) {
    throw new Error("凭据缺少 Access Token，无法查询余额");
  }

  // 构建请求头（参考 Rust 版本）
  const kiroVersion = env.KIRO_VERSION || "0.8.0";
  const machineId = credential.machineId || "default-machine-id";
  
  const userAgent = `aws-sdk-js/1.0.0 ua/2.1 os/darwin#24.6.0 lang/js md/nodejs#22.21.1 api/codewhispererruntime#1.0.0 m/N,E KiroIDE-${kiroVersion}-${machineId}`;
  const amzUserAgent = `aws-sdk-js/1.0.0 KiroIDE-${kiroVersion}-${machineId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-amz-user-agent": amzUserAgent,
      "User-Agent": userAgent,
      "host": host,
      "amz-sdk-invocation-id": crypto.randomUUID(),
      "amz-sdk-request": "attempt=1; max=1",
      "Authorization": `Bearer ${credential.accessToken}`,
      "Connection": "close",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorMsg = response.status === 401 
      ? "认证失败，Token 无效或已过期"
      : response.status === 403
      ? "权限不足，无法获取使用额度"
      : response.status === 429
      ? "请求过于频繁，已被限流"
      : response.status >= 500
      ? "服务器错误，AWS 服务暂时不可用"
      : "获取使用额度失败";
    
    throw new Error(`${errorMsg}: ${response.status} ${errorText}`);
  }

  const data = await response.json() as UsageLimitsResponse;

  // 计算总使用量和限额（参考 Rust 版本的逻辑）
  const breakdown = data.usageBreakdownList?.[0];
  
  if (!breakdown) {
    throw new Error("API 响应缺少 usageBreakdownList");
  }

  // 基础额度
  let totalLimit = breakdown.usageLimitWithPrecision || 0;
  let totalUsage = breakdown.currentUsageWithPrecision || 0;

  // 累加激活的免费试用额度
  if (breakdown.freeTrialInfo?.freeTrialStatus === "ACTIVE") {
    totalLimit += breakdown.freeTrialInfo.usageLimitWithPrecision || 0;
    totalUsage += breakdown.freeTrialInfo.currentUsageWithPrecision || 0;
  }

  // 累加激活的奖励额度
  for (const bonus of breakdown.bonuses || []) {
    if (bonus.status === "ACTIVE") {
      totalLimit += bonus.usageLimit || 0;
      totalUsage += bonus.currentUsage || 0;
    }
  }

  const remaining = Math.max(0, totalLimit - totalUsage);
  const usagePercentage = totalLimit > 0 ? Math.min(100, (totalUsage / totalLimit) * 100) : 0;

  return {
    id: credential.id,
    subscriptionTitle: data.subscriptionInfo?.subscriptionTitle,
    currentUsage: Math.round(totalUsage),
    usageLimit: Math.round(totalLimit),
    remaining: Math.round(remaining),
    usagePercentage: Math.round(usagePercentage * 100) / 100,
    nextResetAt: data.nextDateReset || breakdown.nextDateReset,
  };
}
