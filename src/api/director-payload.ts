// Pure payload builders for AIGC edge functions. Keeping these pure lets us
// unit-test the exact JSON we send to the shared Supabase functions without
// mocking the network. Runtime code composes these into `functions.invoke`.

import type { Asset } from "@/types";

export type DirectorShot = {
  shot_index: number;
  duration_s: number;
  scene: string;
  action: string;
  dialogue?: string;
  subtitle?: string;
  image_index?: number | null;
};

export type DirectorScript = {
  title?: string;
  shots: DirectorShot[];
  // Preserve any additional fields the edge function returned so the final
  // director-create-job call receives the ORIGINAL script verbatim.
  [key: string]: unknown;
};

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
  // Fixed default; PC UI no longer exposes this to users.
  model?: string;
};

export const DEFAULT_DIRECTOR_MODEL = "seedance-2-pro";

export function buildDirectorCreatePayload(input: DirectorCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    shop_id: input.shopId,
    // Send the ORIGINAL script — do NOT rewrite shot counts or durations.
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

export type SurpriseInput = {
  shopId: string;
  videoType: string;
  category?: string;
  aspect: string;
  imageUrls: string[];
  style?: string;
  duration?: number; // one-shot Seedance path, fixed 15s
};

export function buildSurprisePreviewPayload(input: SurpriseInput): Record<string, unknown> {
  return {
    shop_id: input.shopId,
    video_type: input.videoType,
    category: input.category ?? null,
    aspect: input.aspect,
    image_urls: input.imageUrls,
    style: input.style ?? null,
    duration: input.duration ?? 15,
    preview: true,
  };
}

export function buildSurpriseSubmitPayload(input: SurpriseInput): Record<string, unknown> {
  return {
    shop_id: input.shopId,
    video_type: input.videoType,
    category: input.category ?? null,
    aspect: input.aspect,
    image_urls: input.imageUrls,
    style: input.style ?? null,
    duration: input.duration ?? 15,
    preview: false,
  };
}

export function pickedAssetsFromLibrary(assets: Asset[]): PickedAssetRef[] {
  return assets
    .filter((a) => !!a.outputUrl)
    .map((a) => ({ id: a.id, url: a.outputUrl!, thumbnail_url: a.thumbnailUrl ?? null }));
}

export function imageUrlsFromAssets(assets: Asset[]): string[] {
  return assets.map((a) => a.outputUrl).filter((u): u is string => !!u);
}