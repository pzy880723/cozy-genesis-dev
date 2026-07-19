import { createServerFn } from "@tanstack/react-start";
import { hasErpAigcAccess, validateErpTicket } from "./erp-sso-contract";

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
        body: JSON.stringify({ ticket }),
      });
    } catch (_e) {
      return { ok: false as const, error: toUiError("erp_unavailable") };
    }

    if (!resp.ok) {
      let code = "erp_unavailable";
      try {
        const j = (await resp.json()) as { error?: string; code?: string };
        code = j?.code ?? j?.error ?? code;
      } catch {
        /* ignore */
      }
      return { ok: false as const, error: toUiError(code) };
    }

    const payload = (await resp.json()) as {
      ok?: boolean;
      data?: { user?: ErpExchangeUser };
      error?: string;
      code?: string;
    };
    const erpUser = payload?.data?.user;
    if (!payload?.ok || !erpUser?.id) {
      return {
        ok: false as const,
        error: toUiError(payload?.code ?? payload?.error ?? "erp_unavailable"),
      };
    }

    const roles = (erpUser.roles ?? []).filter((r) => typeof r === "string");
    const permissions = (erpUser.permissions ?? []).filter((p) => typeof p === "string");
    if (!hasErpAigcAccess(roles, permissions)) {
      return { ok: false as const, error: toUiError("no_aigc_permission") };
    }

    // 2) admin client（懒加载，避免进入 client bundle）
    const { getSharedAdmin } = await import("./shared-admin.server");
    // 新表 erp_user_links 不在生成的 Database 类型里，用 loose 客户端做数据库操作。
    const admin = getSharedAdmin();
    const db = admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{ data: { aigc_user_id?: string } | null; error: unknown }>;
          };
        };
        upsert: (
          row: Record<string, unknown>,
          opts?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) => Promise<{ error: unknown }>;
        update: (row: Record<string, unknown>) => {
          eq: (col: string, v: string) => Promise<{ error: unknown }>;
        };
      };
    };

    const shopIdPrimary = erpUser.shops?.[0]?.id ?? null;
    const shopNamePrimary = erpUser.shops?.[0]?.name ?? null;
    const userMetadata = {
      phone: erpUser.phone ?? null,
      display_name: erpUser.display_name ?? null,
      shop_name: shopNamePrimary,
    };
    const appMetadata = {
      auth_source: "erp" as const,
      erp_user_id: erpUser.id,
      roles,
      permissions,
      shop_id: shopIdPrimary,
      shops: erpUser.shops ?? [],
    };

    // 3) 查影子用户
    const { data: linkRow, error: linkErr } = await db
      .from("erp_user_links")
      .select("erp_user_id, aigc_user_id")
      .eq("erp_user_id", erpUser.id)
      .maybeSingle();
    if (linkErr) {
      console.error("[erp-sso] link lookup failed", linkErr);
      return { ok: false as const, error: toUiError("session_mint_failed") };
    }

    // 合成 AIGC 侧登录邮箱（用户不可知，仅内部标识）
    const shadowEmail = `erp+${erpUser.id}@aigc.boomeroff.local`;

    let aigcUserId: string | null =
      (linkRow as { aigc_user_id?: string } | null)?.aigc_user_id ?? null;

    if (!aigcUserId) {
      // 并发安全：以 erp_user_links (erp_user_id PK) 为唯一映射真源。
      // 步骤：createUser -> upsert link (ignoreDuplicates)
      //      -> 回读 canonical aigc_user_id；若非本次新建则清理孤儿 auth 用户。
      const randomPw = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: shadowEmail,
        email_confirm: true,
        password: randomPw,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });
      if (createErr || !created?.user) {
        // A second first-login request may have created the deterministic email
        // just before this request. Give its mapping a short window to appear.
        for (let attempt = 0; attempt < 5 && !aigcUserId; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 80));
          const { data: racedLink, error: racedLinkErr } = await db
            .from("erp_user_links")
            .select("aigc_user_id")
            .eq("erp_user_id", erpUser.id)
            .maybeSingle();
          if (racedLinkErr) break;
          aigcUserId = racedLink?.aigc_user_id ?? null;
        }
        if (!aigcUserId) {
          console.error("[erp-sso] createUser failed", createErr);
          return { ok: false as const, error: toUiError("session_mint_failed") };
        }
      } else {
        const candidateId = created.user.id;

        const { error: upsertErr } = await db.from("erp_user_links").upsert(
          {
            erp_user_id: erpUser.id,
            aigc_user_id: candidateId,
            phone: erpUser.phone,
            display_name: erpUser.display_name,
            roles,
            permissions,
            shops: erpUser.shops ?? [],
          },
          { onConflict: "erp_user_id", ignoreDuplicates: true },
        );
        if (upsertErr) {
          console.error("[erp-sso] link upsert failed", upsertErr);
          await admin.auth.admin.deleteUser(candidateId).catch(() => {});
          return { ok: false as const, error: toUiError("session_mint_failed") };
        }

        const { data: canonical, error: reReadErr } = await db
          .from("erp_user_links")
          .select("aigc_user_id")
          .eq("erp_user_id", erpUser.id)
          .maybeSingle();
        if (reReadErr || !canonical?.aigc_user_id) {
          console.error("[erp-sso] link re-read failed", reReadErr);
          await admin.auth.admin.deleteUser(candidateId).catch(() => {});
          return { ok: false as const, error: toUiError("session_mint_failed") };
        }
        aigcUserId = canonical.aigc_user_id;

        if (aigcUserId !== candidateId) {
          await admin.auth.admin.deleteUser(candidateId).catch((error) => {
            console.error("[erp-sso] orphan cleanup failed", error);
          });
        }
      }
    }

    if (!aigcUserId) {
      return { ok: false as const, error: toUiError("session_mint_failed") };
    }

    // Refresh both auth metadata and the auditable mapping before minting a session.
    const { error: updErr } = await admin.auth.admin.updateUserById(aigcUserId, {
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });
    if (updErr) {
      console.error("[erp-sso] updateUser failed", updErr);
      return { ok: false as const, error: toUiError("session_mint_failed") };
    }

    const { error: touchErr } = await db
      .from("erp_user_links")
      .update({
        phone: erpUser.phone,
        display_name: erpUser.display_name,
        roles,
        permissions,
        shops: erpUser.shops ?? [],
        last_login_at: new Date().toISOString(),
      })
      .eq("erp_user_id", erpUser.id);
    if (touchErr) {
      console.error("[erp-sso] link update failed", touchErr);
      return { ok: false as const, error: toUiError("session_mint_failed") };
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
