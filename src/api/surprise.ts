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
  type SurpriseInput,
} from "./director-payload";

const USE_MOCKS = import.meta.env.VITE_AIGC_USE_MOCKS === "true";

export type SurprisePreview = {
  script?: { title?: string; shots?: unknown[] };
  reference_frames?: string[];
  [k: string]: unknown;
};

export type SurpriseSubmitResult = { job_id: string } & Record<string, unknown>;

export const surpriseApi = {
  async preview(input: SurpriseInput): Promise<SurprisePreview> {
    if (USE_MOCKS) return { script: { title: "mock", shots: [] }, reference_frames: input.imageUrls };
    const { data, error } = await supabase.functions.invoke<SurprisePreview>(
      "surprise-marketing-video",
      { body: buildSurprisePreviewPayload(input) },
    );
    if (error) throw error;
    return (data ?? {}) as SurprisePreview;
  },

  async submit(input: SurpriseInput): Promise<SurpriseSubmitResult> {
    if (USE_MOCKS) return { job_id: `mock_${Date.now()}` };
    const { data, error } = await supabase.functions.invoke<SurpriseSubmitResult>(
      "surprise-marketing-video",
      { body: buildSurpriseSubmitPayload(input) },
    );
    if (error) throw error;
    if (!data?.job_id) throw new Error("surprise-marketing-video 未返回 job_id");
    return data;
  },

  async poll(jobId: string): Promise<{
    status: string;
    progress?: number;
    video_url?: string;
    error?: string;
    [k: string]: unknown;
  }> {
    if (USE_MOCKS) return { status: "done", progress: 100 };
    const { data, error } = await supabase.functions.invoke("poll-marketing-video", {
      body: { job_id: jobId },
    });
    if (error) throw error;
    return (data ?? {}) as { status: string };
  },
};