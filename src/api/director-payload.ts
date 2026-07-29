// Pure payload builders + response unwrappers for AIGC edge functions.
// Keeping these pure lets us unit-test the exact JSON we send/receive
// against the real backend contract without mocking the network.
//
// Backend contracts (source of truth from the shared boomeroff project):
//   • generate-marketing-video-script  -> { success: true, script: { hook, scenes, outro, ... } }
//   • storyboard-marketing-video       -> { ok: true, script: newScript, frames }
//   • director-create-job              -> { job_id | jobId }
//   • director-poll-job                -> { ok: true, job: { id, status, final_video_url, ... }, shots: [...] }
//     completed when job.status === "done"
//   • director-complete-job            -> requires { job_id, final_video_url }, returns { asset_id, ... }
//   • surprise-marketing-video preview -> { script, assets, style, ... }
//   • surprise-marketing-video submit  -> { job_id, ... }  (must echo preview.script/assets/style)
//   • poll-marketing-video             -> { status, video_url, ... }
//     completed when status === "succeeded" (also: running/failed/ready_to_stitch/stitching)

import type { Asset } from "@/types";

// ─── Script shape ────────────────────────────────────────────────────────────

export type DirectorClip = {
  duration_s: number;
  scene: string;
  action: string;
  dialogue?: string;
  subtitle?: string;
  image_index?: number | null;
};

export type DirectorScript = {
  hook: DirectorClip;
  scenes: DirectorClip[];
  outro: DirectorClip;
  title?: string;
  // Preserve any additional fields the edge function returned so downstream
  // calls (storyboard/create-job) receive the ORIGINAL script verbatim.
  [key: string]: unknown;
};

/**
 * Flatten a hook+scenes+outro script into a linear clip list for UI display
 * ONLY. Consumers must never round-trip this array back into a payload — the
 * director-create-job / storyboard requests must carry the original script
 * object (with hook/scenes/outro fields intact) verbatim.
 */
export function clipsFromScript(script: DirectorScript | null | undefined): DirectorClip[] {
  if (!script) return [];
  const out: DirectorClip[] = [];
  if (script.hook) out.push(script.hook);
  if (Array.isArray(script.scenes)) out.push(...script.scenes);
  if (script.outro) out.push(script.outro);
  return out;
}

// ─── Characters & assets ─────────────────────────────────────────────────────

export type MarketingCharacter = {
  id: string;
  name: string;
  role_label?: string | null;
  cover_url?: string | null;
  visual_signature?: string | null;
  core_emotion?: string | null;
  verified_asset_uri?: string | null;
};

export type PickedAssetRef = {
  id: string;
  url: string;
  thumbnail_url?: string | null;
};

// ─── Director create-job ─────────────────────────────────────────────────────

export type DirectorCreateInput = {
  shopId: string;
  script: DirectorScript;
  pickedAssets: PickedAssetRef[];
  aspect: string;
  style?: string;
  resolution?: string;
  userPrompt?: string;
  characterMode: "auto" | "library";
  selectedCharacter?: MarketingCharacter | null;
  model?: string;
};

export const DEFAULT_DIRECTOR_MODEL = "seedance-2-pro";

export function buildDirectorCreatePayload(input: DirectorCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    shop_id: input.shopId,
    // Send the ORIGINAL script (hook+scenes+outro) — do NOT collapse or rewrite.
    script: input.script,
    picked_assets: input.pickedAssets,
    style: input.style ?? null,
    model: input.model ?? DEFAULT_DIRECTOR_MODEL,
    resolution: input.resolution ?? "720p",
    user_prompt: input.userPrompt ?? null,
    aspect: input.aspect,
    character_mode: input.characterMode,
  };
  if (input.characterMode === "library" && input.selectedCharacter) {
    body.selected_character = input.selectedCharacter;
  }
  return body;
}

// ─── Director complete-job ───────────────────────────────────────────────────

export type DirectorCompleteInput = { jobId: string; finalVideoUrl: string };

export function buildDirectorCompletePayload(input: DirectorCompleteInput): Record<string, unknown> {
  if (!input.finalVideoUrl) {
    throw new Error("director-complete-job: final_video_url is required");
  }
  return { job_id: input.jobId, final_video_url: input.finalVideoUrl };
}

// ─── Response unwrappers (validated against real backend shape) ──────────────

export type DirectorJob = {
  id: string;
  status: string; // queued | running | done | failed | ...
  final_video_url?: string | null;
  [k: string]: unknown;
};

export type DirectorPollResult = {
  job: DirectorJob;
  shots: unknown[];
  raw: Record<string, unknown>;
};

/** Unwrap generate-marketing-video-script → { success, script }. */
export function unwrapDirectorScriptResponse(raw: unknown): DirectorScript {
  const r = (raw ?? {}) as { success?: boolean; script?: DirectorScript; error?: string };
  if (r && r.success === false) {
    throw new Error(r.error ?? "generate-marketing-video-script 返回 success=false");
  }
  const s = r?.script;
  if (!s || typeof s !== "object") {
    throw new Error("generate-marketing-video-script 未返回 script");
  }
  return s;
}

/** Unwrap storyboard-marketing-video → { ok, script, frames }. */
export function unwrapStoryboardResponse(raw: unknown): { script: DirectorScript; frames: string[] } {
  const r = (raw ?? {}) as {
    ok?: boolean;
    script?: DirectorScript;
    frames?: unknown[];
    error?: string;
  };
  if (r && r.ok === false) {
    throw new Error(r.error ?? "storyboard-marketing-video 返回 ok=false");
  }
  if (!r?.script) throw new Error("storyboard-marketing-video 未返回 script");
  const frames = Array.isArray(r.frames)
    ? r.frames.map((f) => (typeof f === "string" ? f : (f as { url?: string })?.url ?? ""))
        .filter((u): u is string => !!u)
    : [];
  return { script: r.script, frames };
}

/** Unwrap director-poll-job → { ok, job, shots }. */
export function unwrapDirectorPollResponse(raw: unknown): DirectorPollResult {
  const r = (raw ?? {}) as { ok?: boolean; job?: DirectorJob; shots?: unknown[]; error?: string };
  if (r && r.ok === false) {
    throw new Error(r.error ?? "director-poll-job 返回 ok=false");
  }
  if (!r?.job || typeof r.job !== "object" || !r.job.status) {
    throw new Error("director-poll-job 响应缺少 job.status");
  }
  return {
    job: r.job,
    shots: Array.isArray(r.shots) ? r.shots : [],
    raw: (r ?? {}) as Record<string, unknown>,
  };
}

// ─── Surprise (BOOMER 帮我拍) payloads & response mapping ─────────────────────

export type SurprisePreviewInput = {
  shopId: string;
  videoType: string;
  category?: string | null;
  aspect: string;
  imageUrls: string[];
  duration?: number;
  model?: string;
  resolution?: string;
  realism?: string;
};

export const DEFAULT_SURPRISE_MODEL = "seedance-2-pro";

export function buildSurprisePreviewPayload(input: SurprisePreviewInput): Record<string, unknown> {
  return {
    shop_id: input.shopId,
    video_type: input.videoType,
    category: input.category ?? null,
    aspect: input.aspect,
    image_urls: input.imageUrls,
    duration: input.duration ?? 15,
    model: input.model ?? DEFAULT_SURPRISE_MODEL,
    resolution: input.resolution ?? "720p",
    realism: input.realism ?? "real",
    preview: true,
  };
}

export type SurprisePreviewPayload = {
  script?: unknown;
  assets?: unknown;
  style?: unknown;
  [k: string]: unknown;
};

export type SurpriseSubmitInput = {
  shopId: string;
  aspect: string;
  duration?: number;
  model?: string;
  resolution?: string;
  realism?: string;
  /** Full preview response — script/assets/style must be echoed by reference. */
  preview: SurprisePreviewPayload;
};

/**
 * Build the surprise submit body. `script`, `assets`, `style` are passed
 * through from the preview response by reference so the render job uses the
 * exact same script + reference frames the user just previewed.
 */
export function buildSurpriseSubmitPayload(input: SurpriseSubmitInput): Record<string, unknown> {
  const { preview } = input;
  return {
    shop_id: input.shopId,
    aspect: input.aspect,
    duration: input.duration ?? 15,
    model: input.model ?? DEFAULT_SURPRISE_MODEL,
    resolution: input.resolution ?? "720p",
    realism: input.realism ?? "real",
    // Pass-through — same references as preview response.
    script: preview.script,
    assets: preview.assets,
    picked_assets: preview.assets,
    style: preview.style ?? null,
    preview: false,
  };
}

/**
 * Normalize the surprise poll status. Backend uses `succeeded` for the
 * completed state; the UI treats it as "done" and reads `video_url`.
 * Other backend states pass through unchanged.
 */
export function mapSurprisePollStatus(status: string | null | undefined): string {
  if (status === "succeeded") return "done";
  return status ?? "unknown";
}

// ─── Library helpers ─────────────────────────────────────────────────────────

export function pickedAssetsFromLibrary(assets: Asset[]): PickedAssetRef[] {
  return assets
    .filter((a) => !!a.outputUrl)
    .map((a) => ({ id: a.id, url: a.outputUrl!, thumbnail_url: a.thumbnailUrl ?? null }));
}

export function imageUrlsFromAssets(assets: Asset[]): string[] {
  return assets.map((a) => a.outputUrl).filter((u): u is string => !!u);
}