import { createFileRoute } from "@tanstack/react-router";

/**
 * 自动化 cron tick：每分钟由腾讯云定时函数（或 pg_cron）POST 一次。
 * Bearer 鉴权（复用 WORKER_SHARED_SECRET，方便 Codex/运维统一管理）。
 *
 * 行为：
 *   1) 取 status='enabled' 的 automation_tasks
 *   2) 对每条 task，若当前本地 HH:MM 落在 run_times 任一项 ±2 分钟窗口内
 *   3) 检查今日已生成 job 数（automation_task_id + created_at >= today），< daily_limit 才触发
 *   4) 直接插一条 social_publish_jobs + social_publish_targets，状态 queued/pending；
 *      Worker 下一次 cron-tick 自然领走
 *   5) 写回 last_run_at；失败时按 failure_policy 处理
 */
export const Route = createFileRoute("/api/public/cron/automation-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyBearer } = await import("@/lib/worker-hmac.server");
        const auth = verifyBearer(request);
        if (!auth.ok) {
          return Response.json({ ok: false, error: auth.reason }, { status: 401 });
        }

        const { getSharedAdmin } = await import("@/lib/shared-admin.server");
        const admin = getSharedAdmin();

        const { data: tasks, error } = await admin
          .from("automation_tasks" as any)
          .select("*")
          .eq("status", "enabled");
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        const results: any[] = [];
        for (const t of (tasks as any[]) ?? []) {
          try {
            const runTimes: string[] = Array.isArray(t.run_times) ? t.run_times : [];
            const hit = runTimes.some((s) => {
              const m = /^(\d{1,2}):(\d{2})$/.exec(s);
              if (!m) return false;
              const tm = Number(m[1]) * 60 + Number(m[2]);
              return Math.abs(tm - nowMinutes) <= 2;
            });
            if (!hit) {
              results.push({ id: t.id, skipped: "not_in_window" });
              continue;
            }

            // 今日已生成数
            const countRes = await (admin as any)
              .from("social_publish_jobs")
              .select("id", { head: true, count: "exact" })
              .eq("automation_task_id", t.id)
              .gte("created_at", todayStart.toISOString());
            const count: number = countRes?.count ?? 0;
            if ((count ?? 0) >= (t.daily_limit ?? 1)) {
              results.push({ id: t.id, skipped: "daily_limit_reached", count });
              continue;
            }

            // 拉门店账号
            const { data: accs } = await admin
              .from("social_accounts")
              .select("id, shop_id, platform, cookie_status")
              .in("shop_id", t.shop_ids ?? [])
              .in("platform", t.platforms ?? [])
              .eq("cookie_status", "valid");

            const picks: { shop_id: string; platform: string; account_id: string }[] = [];
            const missing: { shop_id: string; platform: string }[] = [];
            for (const sId of t.shop_ids ?? []) {
              for (const p of t.platforms ?? []) {
                const a = (accs ?? []).find((x) => x.shop_id === sId && x.platform === p);
                if (a) picks.push({ shop_id: sId, platform: p, account_id: a.id });
                else missing.push({ shop_id: sId, platform: p });
              }
            }

            if (!picks.length) {
              await applyFailurePolicy(admin, t, "no_valid_accounts");
              results.push({ id: t.id, error: "no_valid_accounts", missing });
              continue;
            }

            // 创建 job
            const jobInsert: any = {
              shop_id: picks[0].shop_id,
              kind: t.content_kind ?? "image_text",
              title: `[自动] ${t.name}`,
              body: t.content_strategy ?? null,
              tags: [],
              status: "queued",
              automation_task_id: t.id,
              per_platform: {
                scope_type: t.scope_type,
                shop_ids: t.shop_ids,
                platforms: t.platforms,
                asset_ids: [], // v1 自动化任务暂不绑定素材，Worker 收到空数组当文案/兜底处理
                missing,
                source: "automation_tick",
              },
            };
            const { data: job, error: jobErr } = await admin
              .from("social_publish_jobs" as any)
              .insert(jobInsert as any)
              .select("id")
              .single();
            if (jobErr || !job) throw jobErr ?? new Error("job insert failed");
            const jobId = (job as any).id as string;

            const targetRows = picks.map((p) => ({
              job_id: jobId,
              account_id: p.account_id,
              platform: p.platform,
              status: "pending" as const,
            }));
            const { error: tErr } = await admin
              .from("social_publish_targets")
              .insert(targetRows as any);
            if (tErr) throw tErr;

            await admin
              .from("automation_tasks" as any)
              .update({
                last_run_at: now.toISOString(),
                last_error: null,
                status: "enabled",
              })
              .eq("id", t.id);

            results.push({ id: t.id, ok: true, job_id: jobId, targets: picks.length });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await applyFailurePolicy(admin, t, msg);
            results.push({ id: t.id, error: msg });
          }
        }

        return Response.json({ ok: true, scanned: (tasks as any[])?.length ?? 0, results });
      },
    },
  },
});

async function applyFailurePolicy(admin: any, t: any, errMsg: string) {
  const policy = t.failure_policy ?? "retry_once";
  const patch: any = { last_error: errMsg, updated_at: new Date().toISOString() };
  if (policy === "pause") patch.status = "paused";
  else if (policy === "notify") patch.status = "error";
  // retry_once: 保持 enabled，下次窗口再试
  await admin.from("automation_tasks").update(patch).eq("id", t.id);
}