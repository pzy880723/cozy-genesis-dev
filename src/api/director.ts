// Runtime client for the AIGC "director" edge functions living in the shared
// boomeroff Supabase project. This module ONLY handles the custom
// script-driven video workflow (director-*). The one-click "BOOMER 帮我拍"
// path lives in `surprise.ts` and must stay separate — do not merge.

import { supabase } from "@/integrations/shared-db/client";
import type { Asset } from "@/types";
import {
  buildDirectorCreatePayload,
  DEFAULT_DIRECTOR_MODEL,
  type DirectorCreateInput,
  type DirectorScript,
  type DirectorShot,
  type MarketingCharacter,
  type PickedAssetRef,
} from "./director-payload";

const USE_MOCKS = import.meta.env.VITE_AIGC_USE_MOCKS === "true";

export type { DirectorScript, DirectorShot, MarketingCharacter, PickedAssetRef };
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

function throwIfError<T>(data: T, error: unknown): T {
  if (error) throw error;
  return data;
}

function mockScript(input: GenerateScriptInput): DirectorScript {
  // Development-only shape (VITE_AIGC_USE_MOCKS=true) — never used in prod.
  const per = Math.max(3, Math.round(input.duration / 4));
  const count = Math.max(2, Math.min(6, Math.floor(input.duration / per)));
  const shots: DirectorShot[] = Array.from({ length: count }, (_, i) => ({
    shot_index: i,
    duration_s: i === count - 1 ? input.duration - per * (count - 1) : per,
    scene: `场景 ${i + 1}`,
    action: `镜头动作 ${i + 1}`,
    dialogue: i === 0 ? "这里是本片首镜口播" : "承接镜头旁白",
    subtitle: i === 0 ? "开场字幕" : `第 ${i + 1} 镜字幕`,
    image_index: input.imageUrls.length > 0 ? i % input.imageUrls.length : null,
  }));
  return { title: `${input.videoType} · ${input.duration}s`, shots };
}

export const directorApi = {
  async generateScript(input: GenerateScriptInput): Promise<DirectorScript> {
    if (USE_MOCKS) return mockScript(input);
    const { data, error } = await supabase.functions.invoke<DirectorScript>(
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
    return throwIfError(data as DirectorScript, error);
  },

  async generateStoryboard(input: {
    shopId: string;
    script: DirectorScript;
    imageUrls: string[];
    aspect: string;
    style?: string;
  }): Promise<DirectorScript> {
    if (USE_MOCKS) return input.script;
    const { data, error } = await supabase.functions.invoke<DirectorScript>(
      "storyboard-marketing-video",
      {
        body: {
          shop_id: input.shopId,
          // Pass through the ORIGINAL script so the storyboard function can
          // pair each shot with a frame without mutating shot count/order.
          script: input.script,
          image_urls: input.imageUrls,
          aspect: input.aspect,
          style: input.style ?? null,
        },
      },
    );
    return throwIfError(data as DirectorScript, error);
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

  async pollJob(jobId: string): Promise<{
    status: string;
    progress?: number;
    video_url?: string;
    error?: string;
    [k: string]: unknown;
  }> {
    if (USE_MOCKS) return { status: "done", progress: 100, video_url: "" };
    const { data, error } = await supabase.functions.invoke("director-poll-job", {
      body: { job_id: jobId },
    });
    if (error) throw error;
    return (data ?? {}) as { status: string };
  },

  async completeJob(jobId: string): Promise<Record<string, unknown>> {
    if (USE_MOCKS) return {};
    const { data, error } = await supabase.functions.invoke("director-complete-job", {
      body: { job_id: jobId },
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