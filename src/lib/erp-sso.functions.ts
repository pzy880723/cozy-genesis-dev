import { createServerFn } from "@tanstack/react-start";

type ErpShop = { id: string; name: string };
type ErpExchangeUser = {
  id: string;
  phone: string | null;
  display_name: string | null;
  roles: string[];
  shops: ErpShop[];
  permissions?: string[];
};

// 前端可展示的错误码，映射到中文提示。
const ERR_MSG: Record<string, string> = {
  ticket_expired: "登录票据已过期，请回到 ERP 重新点击「AI 营销中心」",
  ticket_consumed: "该登录票据已被使用，请回到 ERP 重新进入",
  ticket_invalid: "登录票据无效，请回到 ERP 重新进入",
  ticket_required: "缺少登录票据",
  invalid_body: "登录请求异常",
  user_banned: "该 ERP 账号已被停用，请联系管理员",
  user_not_found: "ERP 账号不存在，请联系管理员",
  unauthorized: "AIGC 与 ERP 之间的鉴权失败，请联系管理员检查密钥",
  secret_missing: "AIGC 服务器未配置 ERP 密钥，请联系管理员",
  no_aigc_permission: "该账号暂无 AIGC 平台权限，请联系管理员开通",
  erp_unavailable: "ERP 服务暂时不可用，请稍后再试",
  session_mint_failed: "AIGC 会话生成失败，请稍后再试",
  config_missing: "AIGC 服务器未配置 ERP 接入地址，请联系管理员",
};

function toUiError(code: string): { code: string; message: string } {
  return { code, message: ERR_MSG[code] ?? "登录失败，请稍后再试" };
}

// 允许的 AIGC 角色（其它一律无权进入）
const AIGC_ALLOWED_ROLES = new Set(["admin", "moderator", "user"]);

export const exchangeErpTicket = createServerFn({ method: "POST" })
  .inputValidator((input: { ticket: string }) => {
    if (!input || typeof input.ticket !== "string" || input.ticket.length < 8) {
      throw new Error("ticket_required");
    }
    return { ticket: input.ticket };
  })
  .handler(async ({ data }) => {
    const erpBase = process.env.ERP_SSO_BASE_URL;
    const secret = process.env.ERP_AIGC_SSO_SECRET;
    if (!erpBase) return { ok: false as const, error: toUiError("config_missing") };
    if (!secret) return { ok: false as const, error: toUiError("secret_missing") };

    // 1) 服务端调用 ERP exchange
    let resp: Response;
    try {
      resp = await fetch(`${erpBase.replace(/\/$/, "")}/api/public/sso/aigc-exchange`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-erp-sso-secret": secret,
        },
        body: JSON.stringify({ ticket: data.ticket }),
      });
    } catch (_e) {
      return { ok: false as const, error: toUiError("erp_unavailable") };
    }

    if (!resp.ok) {
      let code = "erp_unavailable";
      try {
        const j = (await resp.json()) as { error?: string; code?: string };
        code = j?.code ?? j?.error ?? code;
      } catch { /* ignore */ }
      return { ok: false as const, error: toUiError(code) };
    }

    const payload = (await resp.json()) as { ok?: boolean; data?: { user?: ErpExchangeUser }; error?: string; code?: string };
    const erpUser = payload?.data?.user;
    if (!payload?.ok || !erpUser?.id) {
      return { ok: false as const, error: toUiError(payload?.code ?? payload?.error ?? "erp_unavailable") };
    }

    const roles = (erpUser.roles ?? []).filter((r) => typeof r === "string");
    const hasAllowedRole = roles.some((r) => AIGC_ALLOWED_ROLES.has(r));
    if (!hasAllowedRole) {
      return { ok: false as const, error: toUiError("no_aigc_permission") };
    }

    // 2) admin client（懒加载，避免进入 client bundle）
    const { getSharedAdmin } = await import("./shared-admin.server");
    const admin = getSharedAdmin();

    const shopIdPrimary = erpUser.shops?.[0]?.id ?? null;
    const shopNamePrimary = erpUser.shops?.[0]?.name ?? null;
    const metadata = {
      auth_source: "erp" as const,
      erp_user_id: erpUser.id,
      phone: erpUser.phone ?? null,
      display_name: erpUser.display_name ?? null,
      roles,
      permissions: erpUser.permissions ?? [],
      shop_id: shopIdPrimary,
      shop_name: shopNamePrimary,
      shops: erpUser.shops ?? [],
    };

    // 3) 查影子用户
    const { data: linkRow, error: linkErr } = await admin
      .from("erp_user_links" as never)
      .select("erp_user_id, aigc_user_id")
      .eq("erp_user_id", erpUser.id)
      .maybeSingle();
    if (linkErr) {
      console.error("[erp-sso] link lookup failed", linkErr);
      return { ok: false as const, error: toUiError("session_mint_failed") };
    }

    // 合成 AIGC 侧登录邮箱（用户不可知，仅内部标识）
    const shadowEmail = `erp+${erpUser.id}@aigc.boomeroff.local`;

    let aigcUserId: string | null = (linkRow as { aigc_user_id?: string } | null)?.aigc_user_id ?? null;

    if (!aigcUserId) {
      // 创建影子用户（不设员工可知密码；随机 password，仅内部占位）
      const randomPw = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: shadowEmail,
        email_confirm: true,
        password: randomPw,
        user_metadata: metadata,
      });
      if (createErr || !created.user) {
        // 兜底：可能是并发或历史遗留同邮箱用户
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = list?.users?.find((u) => u.email === shadowEmail);
        if (!existing) {
          console.error("[erp-sso] createUser failed", createErr);
          return { ok: false as const, error: toUiError("session_mint_failed") };
        }
        aigcUserId = existing.id;
      } else {
        aigcUserId = created.user.id;
      }

      const { error: insertErr } = await admin
        .from("erp_user_links" as never)
        .insert({
          erp_user_id: erpUser.id,
          aigc_user_id: aigcUserId,
          phone: erpUser.phone,
          display_name: erpUser.display_name,
          roles,
          shops: erpUser.shops ?? [],
        } as never);
      if (insertErr) {
        console.error("[erp-sso] link insert failed", insertErr);
      }
    } else {
      // 已存在：刷新 metadata + last_login_at
      const { error: updErr } = await admin.auth.admin.updateUserById(aigcUserId, {
        user_metadata: metadata,
      });
      if (updErr) console.error("[erp-sso] updateUser failed", updErr);

      await admin
        .from("erp_user_links" as never)
        .update({
          phone: erpUser.phone,
          display_name: erpUser.display_name,
          roles,
          shops: erpUser.shops ?? [],
          last_login_at: new Date().toISOString(),
        } as never)
        .eq("erp_user_id", erpUser.id);
    }

    // 4) 生成一次性 magiclink token（前端用 verifyOtp 建立当前会话）
    const { data: linkData, error: genErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: shadowEmail,
    });
    if (genErr || !linkData?.properties?.hashed_token) {
      console.error("[erp-sso] generateLink failed", genErr);
      return { ok: false as const, error: toUiError("session_mint_failed") };
    }

    return {
      ok: true as const,
      email: shadowEmail,
      tokenHash: linkData.properties.hashed_token,
      displayName: erpUser.display_name ?? erpUser.phone ?? "",
    };
  });