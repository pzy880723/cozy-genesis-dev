import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker → Cloud 回调。HMAC 签名验证。
 *
 * Headers:
 *   X-Worker-Timestamp: 毫秒时间戳
 *   X-Worker-Signature: hex(hmac_sha256(secret, ts + "." + raw_body))
 *
 * Body 形如：
 *   { "event": "target.success",
 *     "target_id": "...",
 *     "claim_token": "...",
 *     "data": { ... 视 event 而定 } }
 *
 * 支持事件：
 *   target.progress     { progress: 0..100, step: string }
 *   target.success      { platform_post_id?, platform_post_url? }
 *   target.failed       { error_message, retry_after_seconds?: number }
 *   target.cancelled    {}
 *   account.bound       (account_id) { worker_account_key, worker_account_id?, account_name?, capabilities? }
 *   account.cookie_expired (account_id) {}
 *   account.checked     (account_id) { ok: boolean, last_check_at?: string }
 *   log                 (任意) { message: string, level?: string } — 仅打日志
 */
export const Route = createFileRoute("/api/public/worker/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyHmac } = await import("@/lib/worker-hmac.server");
        const raw = await request.text();
        const verdict = verifyHmac(request, raw);
        if (!verdict.ok) {
          return Response.json({ ok: false, error: verdict.reason }, { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }
        const event = String(payload?.event ?? "");
        if (!event) {
          return Response.json({ ok: false, error: "missing event" }, { status: 400 });
        }

        const { getSharedAdmin } = await import("@/lib/shared-admin.server");
        const admin = getSharedAdmin();

        try {
          if (event === "log") {
            console.log("[worker.log]", payload);
            return Response.json({ ok: true });
          }

          // -------- target 相关 --------
          if (event.startsWith("target.")) {
            const targetId = String(payload.target_id ?? "");
            if (!targetId) {
              return Response.json({ ok: false, error: "missing target_id" }, { status: 400 });
            }
            // claim_token 校验：可选但推荐
            const { data: curRaw, error: curErr } = await admin
              .from("social_publish_targets" as any)
              .select("id, status, claim_token, retry_count, job_id, account_id")
              .eq("id", targetId)
              .maybeSingle();
            if (curErr || !curRaw) {
              return Response.json({ ok: false, error: "target not found" }, { status: 404 });
            }
            const cur = curRaw as any;
            if (
              payload.claim_token &&
              cur.claim_token &&
              payload.claim_token !== cur.claim_token
            ) {
              return Response.json({ ok: false, error: "claim_token mismatch" }, { status: 409 });
            }

            const now = new Date().toISOString();
            const data = payload.data ?? {};

            if (event === "target.progress") {
              const patch: any = { updated_at: now };
              if (typeof data.progress === "number") {
                patch.progress = Math.max(0, Math.min(100, Math.round(data.progress)));
              }
              if (typeof data.step === "string") patch.last_step = data.step;
              if (cur.status !== "running") patch.status = "running";
              await admin.from("social_publish_targets" as any).update(patch).eq("id", targetId);
              return Response.json({ ok: true });
            }

            if (event === "target.success") {
              await admin
                .from("social_publish_targets" as any)
                .update({
                  status: "success",
                  progress: 100,
                  last_step: "done",
                  platform_post_id: data.platform_post_id ?? null,
                  platform_post_url: data.platform_post_url ?? null,
                  platform_url: data.platform_post_url ?? null,
                  finished_at: now,
                  updated_at: now,
                  error_message: null,
                } as any)
                .eq("id", targetId);
              return Response.json({ ok: true });
            }

            if (event === "target.failed") {
              const retryAfter = Number(data.retry_after_seconds);
              const canRetry =
                Number.isFinite(retryAfter) && retryAfter > 0 && (cur.retry_count ?? 0) < 3;
              if (canRetry) {
                await admin
                  .from("social_publish_targets" as any)
                  .update({
                    status: "pending",
                    retry_count: (cur.retry_count ?? 0) + 1,
                    last_retry_at: now,
                    error_message: data.error_message ?? "retrying",
                    last_step: data.step ?? "retry_scheduled",
                    claim_token: null,
                    claim_expires_at: null,
                    worker_task_id: null,
                    updated_at: now,
                  } as any)
                  .eq("id", targetId);
              } else {
                await admin
                  .from("social_publish_targets" as any)
                  .update({
                    status: "failed",
                    error_message: data.error_message ?? "unknown error",
                    last_step: data.step ?? "failed",
                    finished_at: now,
                    updated_at: now,
                  } as any)
                  .eq("id", targetId);
              }
              return Response.json({ ok: true });
            }

            if (event === "target.cancelled") {
              await admin
                .from("social_publish_targets" as any)
                .update({
                  status: "cancelled",
                  finished_at: now,
                  updated_at: now,
                  error_message: data.error_message ?? null,
                } as any)
                .eq("id", targetId);
              return Response.json({ ok: true });
            }

            return Response.json({ ok: false, error: `unknown target event: ${event}` }, { status: 400 });
          }

          // -------- account 相关 --------
          if (event.startsWith("account.")) {
            const accountId = String(payload.account_id ?? "");
            if (!accountId) {
              return Response.json({ ok: false, error: "missing account_id" }, { status: 400 });
            }
            const data = payload.data ?? {};
            const now = new Date().toISOString();

            if (event === "account.bound") {
              const patch: any = {
                cookie_status: "valid",
                last_check_at: now,
                updated_at: now,
              };
              if (data.worker_account_key) patch.worker_account_key = data.worker_account_key;
              if (typeof data.worker_account_id === "number")
                patch.worker_account_id = data.worker_account_id;
              if (data.account_name) patch.account_name = data.account_name;
              if (data.avatar_url) patch.avatar_url = data.avatar_url;
              if (data.capabilities) patch.capabilities = data.capabilities;
              await admin.from("social_accounts").update(patch).eq("id", accountId);
              return Response.json({ ok: true });
            }

            if (event === "account.cookie_expired") {
              await admin
                .from("social_accounts")
                .update({
                  cookie_status: "expired",
                  last_check_at: now,
                  updated_at: now,
                } as any)
                .eq("id", accountId);
              return Response.json({ ok: true });
            }

            if (event === "account.checked") {
              await admin
                .from("social_accounts")
                .update({
                  cookie_status: data.ok ? "valid" : "expired",
                  last_check_at: data.last_check_at ?? now,
                  updated_at: now,
                } as any)
                .eq("id", accountId);
              return Response.json({ ok: true });
            }

            return Response.json({ ok: false, error: `unknown account event: ${event}` }, { status: 400 });
          }

          return Response.json({ ok: false, error: `unknown event: ${event}` }, { status: 400 });
        } catch (e) {
          console.error("[worker.callback] error", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "internal" },
            { status: 500 },
          );
        }
      },
    },
  },
});