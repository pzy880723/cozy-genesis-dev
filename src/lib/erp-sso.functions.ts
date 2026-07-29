import { createServerFn } from "@tanstack/react-start";
import { validateErpTicket } from "./erp-sso-contract";

// 前端可展示的错误码，映射到中文提示。
const ERR_MSG: Record<string, string> = {
  ticket_expired: "登录票据已过期，请回到 ERP 重新点击「AI 营销中心」",
  ticket_consumed: "该登录票据已被使用，请回到 ERP 重新进入",
  ticket_invalid: "登录票据无效，请回到 ERP 重新进入",
  invalid_ticket: "登录票据无效，请回到 ERP 重新进入",
  ticket_required: "缺少登录票据",
  invalid_body: "登录请求异常",
  user_banned: "该 ERP 账号已被停用，请联系管理员",
  user_not_found: "ERP 账号不存在，请联系管理员",
  unauthorized: "AIGC 与 ERP 之间的鉴权失败，请联系管理员检查密钥",
  secret_missing: "AIGC 服务器未配置 ERP 密钥，请联系管理员",
  missing_sso_secret: "AIGC 服务器未配置 ERP 密钥，请联系管理员",
  no_aigc_permission: "该账号暂无 AIGC 平台权限，请联系管理员开通",
  aigc_access_denied: "该账号暂无 AIGC 平台权限，请联系管理员开通",
  erp_unavailable: "ERP 服务暂时不可用，请稍后再试",
  erp_unreachable: "ERP 服务暂时不可用，请稍后再试",
  erp_bad_response: "ERP 返回数据异常，请稍后再试",
  erp_exchange_failed: "ERP 登录换取失败，请稍后再试",
  session_mint_failed: "AIGC 会话生成失败，请稍后再试",
  config_missing: "AIGC 服务器未配置 ERP 接入地址，请联系管理员",
};

function toUiError(code: string): { code: string; message: string } {
  return { code, message: ERR_MSG[code] ?? "登录失败，请稍后再试" };
}

const AIGC_SESSION_ENDPOINT =
  "https://narqwgwpqglathwtyevz.supabase.co/functions/v1/erp-aigc-session";

export const exchangeErpTicket = createServerFn({ method: "POST" })
  .validator((input: { ticket?: string }) => {
    return { ticket: typeof input?.ticket === "string" ? input.ticket : "" };
  })
  .handler(async ({ data }) => {
    let ticket: string;
    try {
      ticket = validateErpTicket(data.ticket);
    } catch {
      return {
        ok: false as const,
        error: toUiError(data.ticket ? "ticket_invalid" : "ticket_required"),
      };
    }

    const secret = process.env.ERP_AIGC_SSO_SECRET;
    if (!secret) return { ok: false as const, error: toUiError("missing_sso_secret") };

    let resp: Response;
    try {
      resp = await fetch(AIGC_SESSION_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-erp-sso-secret": secret,
        },
        body: JSON.stringify({ ticket }),
      });
    } catch {
      return { ok: false as const, error: toUiError("erp_unreachable") };
    }

    let payload:
      | {
          ok?: boolean;
          email?: string;
          tokenHash?: string;
          displayName?: string;
          code?: string;
          error?: string;
        }
      | null = null;
    try {
      payload = (await resp.json()) as typeof payload;
    } catch {
      return { ok: false as const, error: toUiError("erp_bad_response") };
    }

    if (!resp.ok || !payload?.ok) {
      const code = payload?.code ?? payload?.error ?? "erp_exchange_failed";
      return { ok: false as const, error: toUiError(code) };
    }

    if (!payload.email || !payload.tokenHash) {
      return { ok: false as const, error: toUiError("erp_bad_response") };
    }

    return {
      ok: true as const,
      email: payload.email,
      tokenHash: payload.tokenHash,
      displayName: payload.displayName ?? "",
    };
  });
