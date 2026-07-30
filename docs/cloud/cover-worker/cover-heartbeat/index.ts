// cover-heartbeat: 当前领取者续租 + 汇报进度。不改视频状态。
// verify_jwt = false（X-Worker-Token 鉴权）。
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
    const TOKEN = Deno.env.get("COVER_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COVER_WORKER_TOKEN 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const { job_id, worker_id, progress } = await req.json().catch(() => ({} as any));
    if (!job_id) return json({ ok: false, error: "缺少 job_id" }, 400);
    if (!worker_id) return json({ ok: false, error: "缺少 worker_id" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: job, error } = await admin
      .from("marketing_video_jobs")
      .select("id, fallback_notes")
      .eq("id", job_id)
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    const cg = readCoverGeneration(job.fallback_notes);
    if (!cg) return json({ ok: false, error: "该任务没有封面任务" }, 409);
    if (cg.claimed_by !== worker_id) return json({ ok: false, error: "不是当前领取者" }, 409);
    if (cg.status !== "claimed" && cg.status !== "generating") {
      return json({ ok: false, error: `封面任务状态为 ${cg.status}` }, 409);
    }

    const { notes } = mergeCoverGeneration(job.fallback_notes, {
      status: "generating",
      progress: typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : cg.progress,
      claim_expires_at: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
    });

    // CAS：仍由本 worker 持有时才续租（只更新 fallback_notes，不碰 status/video_url）
    const { data: updated, error: updErr } = await admin
      .from("marketing_video_jobs")
      .update({ fallback_notes: notes })
      .eq("id", job_id)
      .filter("fallback_notes->cover_generation->>claimed_by", "eq", worker_id)
      .select("id")
      .maybeSingle();
    if (updErr) return json({ ok: false, error: updErr.message }, 500);
    if (!updated) return json({ ok: false, error: "领取权已被回收" }, 409);

    return json({ ok: true, claim_expires_at: (notes.cover_generation as any).claim_expires_at });
  } catch (e) {
    console.error("[cover-heartbeat] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});