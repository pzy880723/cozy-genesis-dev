import { createFileRoute } from "@tanstack/react-router";

/**
 * Worker 主动拉单：把 status='pending' 的 target 批量 claim 给指定 worker。
 *
 * 请求：
 *   POST /api/public/worker/cron-tick
 *   Authorization: Bearer <WORKER_SHARED_SECRET>
 *   { "worker_id": "tencent-cn-1", "max_batch": 10, "platforms": ["xhs","douyin"]? }
 *
 * 返回：
 *   { ok: true, targets: [ { target_id, claim_token, claim_expires_at, job_id, platform, kind,
 *                            title, body, tags, schedule_at, account: {...}, asset_urls: [...],
 *                            cover_url, per_platform } ] }
 */
export const Route = createFileRoute("/api/public/worker/cron-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyBearer } = await import("@/lib/worker-hmac.server");
        const auth = verifyBearer(request);
        if (!auth.ok) {
          return Response.json({ ok: false, error: auth.reason }, { status: 401 });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const workerId = typeof body.worker_id === "string" ? body.worker_id : "unknown-worker";
        const maxBatch = Math.min(50, Math.max(1, Number(body.max_batch) || 10));
        const platforms: string[] | null = Array.isArray(body.platforms) && body.platforms.length
          ? body.platforms.filter((x: unknown) => typeof x === "string")
          : null;

        const { getSharedAdmin } = await import("@/lib/shared-admin.server");
        const admin = getSharedAdmin();

        // 1) 候选 pending targets（先按 platform 过滤 + due schedule）
        let q = admin
          .from("social_publish_targets")
          .select("id, job_id, platform, account_id")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(maxBatch);
        if (platforms) q = q.in("platform", platforms);
        const { data: candidates, error: candErr } = await q;
        if (candErr) {
          return Response.json({ ok: false, error: candErr.message }, { status: 500 });
        }
        if (!candidates || candidates.length === 0) {
          return Response.json({ ok: true, targets: [] });
        }

        // 2) 过滤掉父 job 已被取消 / schedule_at 未到
        const jobIds = Array.from(new Set(candidates.map((t) => t.job_id)));
        const { data: jobRows, error: jobErr } = await admin
          .from("social_publish_jobs")
          .select(
            "id, shop_id, kind, title, body, tags, schedule_at, status, per_platform, cover_url, media_url, images, automation_task_id",
          )
          .in("id", jobIds);
        if (jobErr) {
          return Response.json({ ok: false, error: jobErr.message }, { status: 500 });
        }
        const jobMap = new Map((jobRows ?? []).map((j) => [j.id, j]));
        const nowMs = Date.now();
        const claimable = candidates.filter((t) => {
          const j = jobMap.get(t.job_id);
          if (!j) return false;
          if (j.status === "cancelled" || j.status === "failed") return false;
          if (j.schedule_at && new Date(j.schedule_at).getTime() > nowMs) return false;
          return true;
        });
        if (!claimable.length) return Response.json({ ok: true, targets: [] });

        // 3) 原子 claim：把 status pending → claimed，写入 claim_token / worker_task_id / claim_expires_at
        const claimIds = claimable.map((t) => t.id);
        const claimExpiresAt = new Date(nowMs + 15 * 60 * 1000).toISOString();
        const claimToken = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
        const workerTaskId = `${workerId}:${claimToken}`;
        const { data: claimed, error: claimErr } = await admin
          .from("social_publish_targets")
          .update({
            status: "claimed",
            claim_token: claimToken,
            claim_expires_at: claimExpiresAt,
            worker_task_id: workerTaskId,
            started_at: new Date().toISOString(),
            last_step: "claimed_by_worker",
            progress: 5,
          } as any)
          .in("id", claimIds)
          .eq("status", "pending") // 防抢
          .select("id, job_id, platform, account_id, claim_token, claim_expires_at, worker_task_id");
        if (claimErr) {
          return Response.json({ ok: false, error: claimErr.message }, { status: 500 });
        }
        if (!claimed?.length) return Response.json({ ok: true, targets: [] });

        // 4) 拉账号 + 素材
        const accountIds = Array.from(new Set(claimed.map((t) => t.account_id)));
        const { data: accounts } = await admin
          .from("social_accounts")
          .select("id, account_name, worker_account_key, worker_account_id, platform, cookie_status")
          .in("id", accountIds);
        const accMap = new Map((accounts ?? []).map((a) => [a.id, a]));

        const allAssetIds = Array.from(
          new Set(
            (jobRows ?? []).flatMap((j) => {
              const per = (j.per_platform ?? {}) as any;
              const ids = Array.isArray(per?.asset_ids) ? per.asset_ids : [];
              return ids.filter((x: unknown) => typeof x === "string");
            }),
          ),
        );
        const assetMap = new Map<string, { output_url: string | null; kind: string; meta: any }>();
        if (allAssetIds.length) {
          const { data: assets } = await admin
            .from("marketing_assets")
            .select("id, output_url, kind, meta")
            .in("id", allAssetIds);
          for (const a of assets ?? []) {
            assetMap.set(a.id, { output_url: a.output_url, kind: a.kind, meta: a.meta });
          }
        }

        // 5) 升 job → running
        await admin
          .from("social_publish_jobs")
          .update({ status: "running", updated_at: new Date().toISOString() } as any)
          .in("id", jobIds)
          .eq("status", "queued");

        // 6) 组装 payload
        const targets = claimed.map((t) => {
          const job = jobMap.get(t.job_id)!;
          const acc = accMap.get(t.account_id);
          const per = (job.per_platform ?? {}) as any;
          const assetIds: string[] = Array.isArray(per?.asset_ids) ? per.asset_ids : [];
          const assetUrls = assetIds
            .map((id) => assetMap.get(id)?.output_url)
            .filter((u): u is string => typeof u === "string" && u.length > 0);
          // 兼容历史：如果 job.media_url / images 也填了，合并去重
          if (job.media_url) assetUrls.push(job.media_url);
          if (Array.isArray(job.images)) assetUrls.push(...job.images.filter((x) => typeof x === "string"));
          const dedupAssetUrls = Array.from(new Set(assetUrls));

          return {
            target_id: t.id,
            claim_token: t.claim_token,
            claim_expires_at: t.claim_expires_at,
            worker_task_id: t.worker_task_id,
            job_id: t.job_id,
            platform: t.platform, // DB 名: xhs / wechat_channels / douyin / kuaishou
            kind: job.kind, // 'video' | 'image_text' | 'copy'
            title: job.title ?? "",
            body: job.body ?? "",
            tags: Array.isArray(job.tags) ? job.tags : [],
            schedule_at: job.schedule_at,
            cover_url: job.cover_url,
            asset_urls: dedupAssetUrls,
            account: acc
              ? {
                  id: acc.id,
                  worker_account_key: acc.worker_account_key,
                  worker_account_id: acc.worker_account_id,
                  account_name: acc.account_name,
                  platform: acc.platform,
                  cookie_status: acc.cookie_status,
                }
              : { id: t.account_id, worker_account_key: null },
            per_platform: per?.per_platform ?? null, // 平台级 override（如不同标题/封面）
            automation_task_id: job.automation_task_id ?? null,
          };
        });

        return Response.json({ ok: true, count: targets.length, targets });
      },
    },
  },
});