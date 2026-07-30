// cover-claim-next: 腾讯云 Cover Worker 用 X-Worker-Token 领取一条封面任务。
// 只领取「视频已 succeeded + video_url 存在」且 cover_generation.status='queued'
// 或 claim 已过期（claimed/generating 且 claim_expires_at < now）的任务。
// verify_jwt = false（自定义 token 鉴权）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mergeCoverGeneration, readCoverGeneration } from "../_shared/cover-generation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CLAIM_TTL_MS = 15 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TOKEN = Deno.env.get("COVER_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COVER_WORKER_TOKEN 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const workerId: string = typeof body.worker_id === "string" && body.worker_id ? body.worker_id : "unknown-worker";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await admin
      .from("marketing_video_jobs")
      .select("id, shop_id, user_id, status, video_url, script, fallback_notes, created_at")
      .eq("status", "succeeded")
      .not("video_url", "is", null)
      .not("fallback_notes->cover_generation", "is", null)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) return json({ ok: false, error: error.message }, 500);

    for (const row of rows || []) {
      const cg = readCoverGeneration(row.fallback_notes);
      if (!cg) continue;
      const expired =
        (cg.status === "claimed" || cg.status === "generating") &&
        !!cg.claim_expires_at &&
        new Date(cg.claim_expires_at).getTime() < Date.now();
      if (cg.status !== "queued" && !expired) continue;

      const prevStatus = cg.status;
      const { notes, cover } = mergeCoverGeneration(row.fallback_notes, {
        status: "claimed",
        attempt: Number(cg.attempt || 0) + 1,
        claimed_by: workerId,
        claimed_at: nowIso,
        claim_expires_at: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
        progress: 0,
        error: null,
      });

      // 原子 CAS：只有 cover_generation.status 仍是我们读到的那个值时才更新。
      let q = admin
        .from("marketing_video_jobs")
        .update({ fallback_notes: notes })
        .eq("id", row.id)
        .filter("fallback_notes->cover_generation->>status", "eq", prevStatus);
      if (expired) {
        q = q.filter("fallback_notes->cover_generation->>claimed_at", "eq", String(cg.claimed_at ?? ""));
      }
      const { data: claimed, error: claimErr } = await q.select("id").maybeSingle();
      if (claimErr || !claimed) continue; // 被别的 Worker 抢了，看下一条

      return json({
        ok: true,
        job: {
          id: row.id,
          video_url: row.video_url,
          script: row.script || {},
          cover_generation: cover,
        },
        claim: {
          worker_id: workerId,
          claimed_at: nowIso,
          claim_expires_at: cover.claim_expires_at,
          callback_url: `${SUPABASE_URL}/functions/v1/cover-callback`,
          heartbeat_url: `${SUPABASE_URL}/functions/v1/cover-heartbeat`,
        },
      });
    }

    return json({ ok: true, job: null });
  } catch (e) {
    console.error("[cover-claim-next] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});