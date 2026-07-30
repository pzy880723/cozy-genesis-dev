// Runtime client for the "BOOMER 帮我拍 · 一键出片" flow.
//
// CRITICAL: this path is a SINGLE 15s Seedance reference-to-video call.
// Step 1 preview=true fetches the AI script + reference frames for review.
// Step 2 preview=false submits ONE render job that produces the full 15s clip.
// Step 3 poll-marketing-video reports progress until done.
//
// Never route this flow through director-create-job and never split it into
// per-shot renders — that is the custom "自定义 AI 视频" path.

import { supabase } from "@/integrations/shared-db/client";
import {
  buildSurprisePreviewPayload,
  buildSurpriseSubmitPayload,
  mapSurprisePollStatus,
  type SurprisePreviewInput,
  type SurprisePreviewPayload,
  type SurpriseSubmitInput,
} from "./director-payload";

const USE_MOCKS = import.meta.env.VITE_AIGC_USE_MOCKS === "true";

/**
 * Raw surprise preview response. Callers MUST hand this whole object back
 * to `submit(...)` so the render job uses the exact same script + assets
 * the user just previewed.
 */
export type SurprisePreview = SurprisePreviewPayload;

export type SurpriseSubmitResult = { job_id: string } & Record<string, unknown>;

export type SurprisePollResult = {
  /** Normalized: "done" | "failed" | "running" | "queued" | "ready_to_stitch" | "stitching" | ... */
  status: string;
  video_url?: string;
  progress?: number;
  error?: string;
  /**
   * Post-video cover queue (fallback_notes.cover_generation on the job row).
   * Legacy jobs created before the cover queue have no cover_generation, so
   * poll-marketing-video omits these fields — treat that as "none".
   */
  cover_status?: CoverStatus;
  cover_url?: string;
  cover_error?: string;
  cover_progress?: number;
  raw: Record<string, unknown>;
};

/** "none" = legacy job / cover queue not applicable. */
export type CoverStatus =
  | "none"
  | "queued"
  | "generating"
  | "succeeded"
  | "failed";

const COVER_STATUSES: CoverStatus[] = [
  "none",
  "queued",
  "generating",
  "succeeded",
  "failed",
];

export function normalizeCoverStatus(v: unknown): CoverStatus {
  return typeof v === "string" && (COVER_STATUSES as string[]).includes(v)
    ? (v as CoverStatus)
    : "none";
}

export function isCoverTerminal(s: CoverStatus): boolean {
  return s === "none" || s === "succeeded" || s === "failed";
}

export const surpriseApi = {
  async preview(input: SurprisePreviewInput): Promise<SurprisePreview> {
    if (USE_MOCKS) {
      return {
        script: { title: "mock", hook: {}, scenes: [], outro: {} },
        assets: input.imageUrls.map((url, i) => ({ id: `mock_${i}`, url })),
        style: "steady",
      } as SurprisePreview;
    }
    const { data, error } = await supabase.functions.invoke(
      "surprise-marketing-video",
      { body: buildSurprisePreviewPayload(input) },
    );
    if (error) throw error;
    if (!data || typeof data !== "object") {
      throw new Error("surprise-marketing-video preview 未返回数据");
    }
    return data as SurprisePreview;
  },

  async submit(input: SurpriseSubmitInput): Promise<SurpriseSubmitResult> {
    if (USE_MOCKS) return { job_id: `mock_${Date.now()}` };
    const { data, error } = await supabase.functions.invoke<SurpriseSubmitResult>(
      "surprise-marketing-video",
      { body: buildSurpriseSubmitPayload(input) },
    );
    if (error) throw error;
    if (!data?.job_id) throw new Error("surprise-marketing-video 未返回 job_id");
    return data;
  },

  async poll(jobId: string): Promise<SurprisePollResult> {
    if (USE_MOCKS) return { status: "done", progress: 100, raw: {} };
    const { data, error } = await supabase.functions.invoke("poll-marketing-video", {
      body: { job_id: jobId },
    });
    if (error) throw error;
    const raw = (data ?? {}) as Record<string, unknown>;
    return {
      status: mapSurprisePollStatus(raw.status as string | undefined),
      video_url: raw.video_url as string | undefined,
      progress: typeof raw.progress === "number" ? raw.progress : undefined,
      error: raw.error as string | undefined,
      cover_status: normalizeCoverStatus(raw.cover_status),
      cover_url: (raw.cover_url as string | undefined) || undefined,
      cover_error: (raw.cover_error as string | undefined) || undefined,
      cover_progress:
        typeof raw.cover_progress === "number" ? raw.cover_progress : undefined,
      raw,
    };
  },
};