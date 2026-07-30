// cover-callback: Cover Worker 回写封面结果。
// 成功 body={job_id,cover_url,reference_frame_count,copy_fingerprint,variation_key}
// 失败 body={job_id,error}
// 任何失败都不回退到视频截图；不改视频 status/video_url。
// verify_jwt = false（X-Worker-Token 鉴权）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mergeCoverGeneration, readCoverGeneration } from "../_shared/cover-generation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const TOKEN = Deno.env.get("COVER_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COVER_WORKER_TOKEN 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const jobId: string = body.job_id;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: job, error } = await admin
      .from("marketing_video_jobs")
      .select("id, user_id, fallback_notes")
      .eq("id", jobId)
      .maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    const cg = readCoverGeneration(job.fallback_notes);
    if (!cg) return json({ ok: false, error: "该任务没有封面任务" }, 409);
    if (cg.status === "succeeded" && cg.cover_url) {
      return json({ ok: true, idempotent: true, cover_url: cg.cover_url });
    }

    const nowIso = new Date().toISOString();

    // -------- 失败分支 --------
    if (body.error || !body.cover_url) {
      const message = String(body.error || "Worker 未返回 cover_url");
      const { notes } = mergeCoverGeneration(job.fallback_notes, {
        status: "failed",
        error: message,
        finished_at: nowIso,
      });
      const { error: updErr } = await admin
        .from("marketing_video_jobs")
        .update({ fallback_notes: notes })
        .eq("id", jobId);
      if (updErr) return json({ ok: false, error: updErr.message }, 500);
      return json({ ok: true, marked: "failed" });
    }

    // -------- 成功分支 --------
    const audit = {
      cover_url: String(body.cover_url),
      reference_frame_count:
        typeof body.reference_frame_count === "number" ? body.reference_frame_count : null,
      copy_fingerprint: typeof body.copy_fingerprint === "string" ? body.copy_fingerprint : cg.copy_fingerprint ?? null,
      variation_key: typeof body.variation_key === "string" ? body.variation_key : cg.variation_key ?? null,
    };

    const { notes, cover } = mergeCoverGeneration(job.fallback_notes, {
      ...audit,
      status: "succeeded",
      progress: 100,
      error: null,
      finished_at: nowIso,
    });
    const { error: updErr } = await admin
      .from("marketing_video_jobs")
      .update({ fallback_notes: notes })
      .eq("id", jobId);
    if (updErr) return json({ ok: false, error: updErr.message }, 500);

    // 合并进对应视频素材的 meta（按 meta.job_id 找），保留其它 meta 键
    let assetId: string | null = null;
    let assetError: string | null = null;
    try {
      const { data: asset } = await admin
        .from("marketing_assets")
        .select("id, meta")
        .eq("kind", "video")
        .filter("meta->>job_id", "eq", jobId)
        .maybeSingle();
      if (asset) {
        const nextMeta = {
          ...((asset.meta as any) || {}),
          cover_url: audit.cover_url,
          poster_url: audit.cover_url,
          cover_generation: {
            ...(((asset.meta as any) || {}).cover_generation || {}),
            status: "succeeded",
            cover_url: audit.cover_url,
            reference_frame_count: audit.reference_frame_count,
            copy_fingerprint: audit.copy_fingerprint,
            variation_key: audit.variation_key,
            copy: cover.copy,
            variation: cover.variation,
            finished_at: nowIso,
          },
        };
        const { error: aErr } = await admin.from("marketing_assets").update({ meta: nextMeta }).eq("id", asset.id);
        if (aErr) throw aErr;
        assetId = asset.id;
      }
    } catch (e) {
      assetError = (e as Error).message || String(e);
      console.error("[cover-callback] asset meta merge failed", assetError);
    }

    return json({ ok: true, cover_url: audit.cover_url, asset_id: assetId, asset_error: assetError });
  } catch (e) {
    console.error("[cover-callback] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});