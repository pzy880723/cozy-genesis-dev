// Runtime client for the AIGC "director" edge functions living in the shared
// boomeroff Supabase project. This module ONLY handles the custom
// script-driven video workflow (director-*). The one-click "BOOMER 帮我拍"
// path lives in `surprise.ts` and must stay separate — do not merge.

import { supabase } from "@/integrations/shared-db/client";
import type { Asset } from "@/types";
import {
  buildDirectorCompletePayload,
  buildDirectorCreatePayload,
  DEFAULT_DIRECTOR_MODEL,
  unwrapDirectorPollResponse,
  unwrapDirectorScriptResponse,
  unwrapStoryboardResponse,
  type DirectorClip,
  type DirectorCreateInput,
  type DirectorJob,
  type DirectorPollResult,
  type DirectorScript,
  type MarketingCharacter,
  type PickedAssetRef,
} from "./director-payload";

const USE_MOCKS = import.meta.env.VITE_AIGC_USE_MOCKS === "true";

export type {
  DirectorClip,
  DirectorJob,
  DirectorPollResult,
  DirectorScript,
  MarketingCharacter,
  PickedAssetRef,
};
export { DEFAULT_DIRECTOR_MODEL };

export type GenerateScriptInput = {
  shopId: string;
  imageUrls: string[];
  videoType: string;
  duration: 15 | 20 | 30 | 45 | 60;
  aspect: string;
  topic?: string;
  highlight?: string;
  style?: string;
  briefTranscript?: string;
};

function mockScript(input: GenerateScriptInput): DirectorScript {
  // Development-only shape (VITE_AIGC_USE_MOCKS=true) — never used in prod.
  const remain = Math.max(0, input.duration - 6);
  const midCount = Math.max(1, Math.min(4, Math.round(remain / 6)));
  const midDur = midCount > 0 ? Math.floor(remain / midCount) : 0;
  const scenes: DirectorClip[] = Array.from({ length: midCount }, (_, i) => ({
    duration_s: i === midCount - 1 ? remain - midDur * (midCount - 1) : midDur,
    scene: `场景 ${i + 1}`,
    action: `镜头动作 ${i + 1}`,
    dialogue: "承接镜头旁白",
    subtitle: `第 ${i + 1} 镜字幕`,
    image_index: input.imageUrls.length > 0 ? (i + 1) % input.imageUrls.length : null,
  }));
  return {
    title: `${input.videoType} · ${input.duration}s`,
    hook: {
      duration_s: 3,
      scene: "开场",
      action: "推镜进入",
      dialogue: "这里是本片首镜口播",
      subtitle: "开场字幕",
      image_index: input.imageUrls.length > 0 ? 0 : null,
    },
    scenes,
    outro: {
      duration_s: 3,
      scene: "收尾",
      action: "拉远收尾",
      dialogue: "结尾旁白",
      subtitle: "结尾字幕",
      image_index: input.imageUrls.length > 0 ? input.imageUrls.length - 1 : null,
    },
  };
}

export const directorApi = {
  async generateScript(input: GenerateScriptInput): Promise<DirectorScript> {
    if (USE_MOCKS) return mockScript(input);
    const { data, error } = await supabase.functions.invoke(
      "generate-marketing-video-script",
      {
        body: {
          shop_id: input.shopId,
          image_urls: input.imageUrls,
          video_type: input.videoType,
          duration: input.duration,
          aspect: input.aspect,
          topic: input.topic ?? null,
          highlight: input.highlight ?? null,
          style: input.style ?? null,
          brief_transcript: input.briefTranscript ?? null,
        },
      },
    );
    if (error) throw error;
    return unwrapDirectorScriptResponse(data);
  },

  async generateStoryboard(input: {
    shopId: string;
    script: DirectorScript;
    imageUrls: string[];
    aspect: string;
    style?: string;
  }): Promise<{ script: DirectorScript; frames: string[] }> {
    if (USE_MOCKS) return { script: input.script, frames: [] };
    const { data, error } = await supabase.functions.invoke(
      "storyboard-marketing-video",
      {
        body: {
          shop_id: input.shopId,
          // Pass the ORIGINAL script object verbatim.
          script: input.script,
          image_urls: input.imageUrls,
          aspect: input.aspect,
          style: input.style ?? null,
        },
      },
    );
    if (error) throw error;
    return unwrapStoryboardResponse(data);
  },

  async createJob(input: DirectorCreateInput): Promise<{ jobId: string }> {
    const body = buildDirectorCreatePayload(input);
    if (USE_MOCKS) return { jobId: `mock_${Date.now()}` };
    const { data, error } = await supabase.functions.invoke<{ job_id?: string; jobId?: string }>(
      "director-create-job",
      { body },
    );
    if (error) throw error;
    const jobId = data?.job_id ?? data?.jobId;
    if (!jobId) throw new Error("director-create-job 未返回 job_id");
    return { jobId };
  },

  async pollJob(jobId: string): Promise<DirectorPollResult> {
    if (USE_MOCKS) {
      return {
        job: { id: jobId, status: "done", final_video_url: "" },
        shots: [],
        raw: {},
      };
    }
    const { data, error } = await supabase.functions.invoke("director-poll-job", {
      body: { job_id: jobId },
    });
    if (error) throw error;
    return unwrapDirectorPollResponse(data);
  },

  async completeJob(input: { jobId: string; finalVideoUrl: string }): Promise<Record<string, unknown>> {
    const body = buildDirectorCompletePayload(input);
    if (USE_MOCKS) return { asset_id: `mock_asset_${Date.now()}` };
    const { data, error } = await supabase.functions.invoke("director-complete-job", {
      body,
    });
    if (error) throw error;
    return (data ?? {}) as Record<string, unknown>;
  },

  async listCharacters(shopId: string): Promise<MarketingCharacter[]> {
    if (USE_MOCKS) return [];
    // marketing_characters lives in the shared schema and is not covered by
    // the generated Database types; cast to `any` for the query only.
    const { data, error } = await (supabase.from as any)("marketing_characters")
      .select("id,name,role_label,cover_url,visual_signature,core_emotion,verified_asset_uri,shop_id,created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return ((data ?? []) as MarketingCharacter[]).map((c) => ({
      id: c.id,
      name: c.name,
      role_label: c.role_label ?? null,
      cover_url: c.cover_url ?? null,
      visual_signature: c.visual_signature ?? null,
      core_emotion: c.core_emotion ?? null,
      verified_asset_uri: c.verified_asset_uri ?? null,
    }));
  },
};

// Helper used by page: turn a list of Asset (from library) into url/thumbnail
// pairs suitable for both image_urls (script/storyboard) and picked_assets
// (director-create-job).
export function toPickedAssets(assets: Asset[]): PickedAssetRef[] {
  return assets
    .filter((a) => !!a.outputUrl)
    .map((a) => ({
      id: a.id,
      url: a.outputUrl!,
      thumbnail_url: a.thumbnailUrl ?? null,
    }));
}

export function toImageUrls(assets: Asset[]): string[] {
  return assets.map((a) => a.outputUrl).filter((u): u is string => !!u);
}