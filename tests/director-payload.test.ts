import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectorCreatePayload,
  buildDirectorCompletePayload,
  buildStoryboardPayload,
  buildSurprisePreviewPayload,
  buildSurpriseSubmitPayload,
  clipsFromScript,
  DEFAULT_DIRECTOR_MODEL,
  mapSurprisePollStatus,
  unwrapDirectorCompleteResponse,
  unwrapDirectorPollResponse,
  unwrapDirectorScriptResponse,
  unwrapStoryboardResponse,
  type DirectorScript,
  type MarketingCharacter,
  type PickedAssetRef,
} from "../src/api/director-payload";

// Real backend script shape: hook + scenes[] + outro (durations sum to target).
const SCRIPT: DirectorScript = {
  title: "探店 · 30s",
  hook: { duration_s: 6, scene: "门头", action: "推镜", dialogue: "开场", subtitle: "开场", image_index: 0 },
  scenes: [
    { duration_s: 8, scene: "货架", action: "环绕", dialogue: "承接", subtitle: "承接", image_index: 1 },
    { duration_s: 7, scene: "试戴", action: "特写", dialogue: "细节", subtitle: "细节", image_index: 2 },
  ],
  outro: { duration_s: 9, scene: "结尾", action: "拉远", dialogue: "结尾", subtitle: "结尾", image_index: null },
  meta: { generated_by: "generate-marketing-video-script" },
};

const ASSETS: PickedAssetRef[] = [
  { id: "a1", url: "https://cdn/x/1.jpg", summary: "门头正面", category: "storefront", thumbnail_url: "https://cdn/x/1.t.jpg" },
  { id: "a2", url: "https://cdn/x/2.jpg", summary: "货架细节", category: "product", thumbnail_url: null },
  { id: "a3", url: "https://cdn/x/3.jpg", summary: "试戴特写", category: "lifestyle", thumbnail_url: null },
];

const CHARACTER: MarketingCharacter = {
  id: "c1",
  name: "店员 K",
  role_label: "店员",
  cover_url: "https://cdn/c/1.jpg",
  visual_signature: "短发 + 圆框眼镜",
  core_emotion: "温和 · 专业",
  verified_asset_uri: "assets/character/c1.png",
};

test("director create payload preserves original script, uses selected_character + character_mode=library, includes aspect", () => {
  const body = buildDirectorCreatePayload({
    shopId: "shop_zxth",
    script: SCRIPT,
    pickedAssets: ASSETS,
    aspect: "9:16",
    style: "steady",
    userPrompt: "突出周末活动",
    characterMode: "library",
    selectedCharacter: CHARACTER,
  });
  // Script must be passed through by reference — do NOT collapse into 3×5s.
  assert.equal(body.script, SCRIPT);
  const flat = clipsFromScript(body.script as DirectorScript);
  assert.equal(flat.length, 4);
  assert.deepEqual(flat.map((s) => s.duration_s), [6, 8, 7, 9]);
  // The hook/scenes/outro structure must survive unchanged.
  assert.equal((body.script as DirectorScript).hook.duration_s, 6);
  assert.equal((body.script as DirectorScript).scenes.length, 2);
  assert.equal((body.script as DirectorScript).outro.duration_s, 9);
  assert.equal(body.aspect, "9:16");
  assert.equal(body.character_mode, "library");
  assert.equal(body.selected_character, CHARACTER); // named selected_character, NOT character
  assert.ok(!("character" in body), "must not send legacy `character` field");
  assert.equal(body.model, DEFAULT_DIRECTOR_MODEL); // seedance-2-pro locked internally
  assert.equal(body.shop_id, "shop_zxth");
  assert.equal(body.user_prompt, "突出周末活动");
  assert.equal(body.picked_assets, ASSETS);
});

test("character_mode=auto omits selected_character entirely", () => {
  const body = buildDirectorCreatePayload({
    shopId: "shop_zxth",
    script: SCRIPT,
    pickedAssets: ASSETS,
    aspect: "1:1",
    characterMode: "auto",
    selectedCharacter: CHARACTER, // even if passed, must be dropped
  });
  assert.equal(body.character_mode, "auto");
  assert.ok(!("selected_character" in body), "auto mode must NOT send selected_character");
});

test("surprise (BOOMER 帮我拍) submit echoes preview.script/assets/style by reference", () => {
  const preview = buildSurprisePreviewPayload({
    shopId: "shop_zxth",
    videoType: "store_tour",
    aspect: "9:16",
    imageUrls: ["https://cdn/x/1.jpg", "https://cdn/x/2.jpg"],
  });
  assert.equal(preview.preview, true);
  assert.equal(preview.duration, 15);
  assert.equal(preview.video_type, "store_tour");

  // Simulated preview response from surprise-marketing-video.
  const previewResponse = {
    script: SCRIPT,
    assets: [{ id: "a1", url: "https://cdn/x/1.jpg" }],
    style: "steady",
  };

  const submit = buildSurpriseSubmitPayload({
    shopId: "shop_zxth",
    aspect: "9:16",
    preview: previewResponse,
  });
  assert.equal(submit.preview, false);
  assert.equal(submit.duration, 15);
  // Same-object echo — the render job must use the exact previewed content.
  assert.equal(submit.script, previewResponse.script);
  assert.equal(submit.assets, previewResponse.assets);
  assert.equal(submit.picked_assets, previewResponse.assets);
  assert.equal(submit.style, previewResponse.style);
  // Must NOT carry director-only fields.
  assert.ok(!("character_mode" in submit), "surprise submit must not include character_mode");
  assert.ok(!("selected_character" in submit), "surprise submit must not include selected_character");
});

test("unwrapDirectorScriptResponse extracts .script from { success, script }", () => {
  const raw = { success: true, script: SCRIPT };
  const s = unwrapDirectorScriptResponse(raw);
  assert.equal(s, SCRIPT);
  assert.throws(() => unwrapDirectorScriptResponse({ success: false, error: "boom" }), /boom/);
  assert.throws(() => unwrapDirectorScriptResponse({}), /未返回 script/);
});

test("unwrapStoryboardResponse extracts .script and .frames from { ok, script, frames }", () => {
  const raw = {
    ok: true,
    script: SCRIPT,
    frames: [
      { scene_index: 0, url: "https://cdn/f/1.jpg", key: "k0" },
      { scene_index: 1, url: "https://cdn/f/2.jpg", key: "k1" },
    ],
  };
  const r = unwrapStoryboardResponse(raw);
  assert.equal(r.script, SCRIPT);
  assert.deepEqual(r.frames, ["https://cdn/f/1.jpg", "https://cdn/f/2.jpg"]);
  assert.throws(() => unwrapStoryboardResponse({ ok: false, error: "bad" }), /bad/);
});

test("unwrapDirectorPollResponse reads job.status and final_video_url (not root-level)", () => {
  const raw = {
    ok: true,
    job: { id: "j1", status: "done", final_video_url: "https://cdn/v/final.mp4" },
    shots: [{ shot_index: 0 }, { shot_index: 1 }],
  };
  const r = unwrapDirectorPollResponse(raw);
  assert.equal(r.job.status, "done");
  assert.equal(r.job.final_video_url, "https://cdn/v/final.mp4");
  assert.equal(r.shots.length, 2);
  assert.throws(() => unwrapDirectorPollResponse({ ok: true }), /job\.status/);
});

test("director-complete-job payload requires final_video_url", () => {
  const body = buildDirectorCompletePayload({ jobId: "j1", finalVideoUrl: "https://cdn/v/final.mp4" });
  assert.equal(body.job_id, "j1");
  assert.equal(body.final_video_url, "https://cdn/v/final.mp4");
  assert.throws(() => buildDirectorCompletePayload({ jobId: "j1", finalVideoUrl: "" }), /final_video_url/);
});

test("poll-marketing-video 'succeeded' status maps to 'done' for the surprise flow", () => {
  assert.equal(mapSurprisePollStatus("succeeded"), "done");
  assert.equal(mapSurprisePollStatus("running"), "running");
  assert.equal(mapSurprisePollStatus("failed"), "failed");
  assert.equal(mapSurprisePollStatus("ready_to_stitch"), "ready_to_stitch");
  assert.equal(mapSurprisePollStatus(undefined), "unknown");
});

// ─── Round 3 · storyboard payload + positional frames + poll progress ───────

test("storyboard payload sends positional assets + character (image_index → assets[index])", () => {
  const body = buildStoryboardPayload({
    shopId: "shop_zxth",
    script: SCRIPT,
    pickedAssets: ASSETS,
    selectedCharacter: CHARACTER,
    style: "steady",
    realism: "photoreal",
  });
  assert.equal(body.shop_id, "shop_zxth");
  assert.equal(body.script, SCRIPT); // original by reference
  assert.equal(body.character, CHARACTER); // selected character, not `selected_character`
  assert.equal(body.style, "steady");
  assert.equal(body.realism, "photoreal");
  // NEVER send image_urls / aspect — those are ignored by storyboard-marketing-video.
  assert.ok(!("image_urls" in body), "storyboard must NOT send image_urls");
  assert.ok(!("aspect" in body), "storyboard must NOT send aspect");

  const assets = body.assets as Array<{ asset_id: string; index: number; url: string; summary: string; category: string | null }>;
  assert.equal(assets.length, 3);
  // Positional index === array position.
  assert.deepEqual(assets.map((a) => a.index), [0, 1, 2]);
  assert.deepEqual(assets.map((a) => a.asset_id), ["a1", "a2", "a3"]);
  assert.deepEqual(assets.map((a) => a.summary), ["门头正面", "货架细节", "试戴特写"]);
  assert.deepEqual(assets.map((a) => a.category), ["storefront", "product", "lifestyle"]);

  // image_index=1 in a script clip must resolve to the SECOND asset.
  const clipWithIdx1 = SCRIPT.scenes[0];
  assert.equal(clipWithIdx1.image_index, 1);
  assert.equal(assets[clipWithIdx1.image_index!].asset_id, "a2");
});

test("storyboard payload auto-mode passes character=null", () => {
  const body = buildStoryboardPayload({
    shopId: "shop_zxth",
    script: SCRIPT,
    pickedAssets: ASSETS,
    selectedCharacter: null,
  });
  assert.equal(body.character, null);
});

test("storyboard payload includes only_indices when provided (single-shot regen)", () => {
  const body = buildStoryboardPayload({
    shopId: "shop_zxth",
    script: SCRIPT,
    pickedAssets: ASSETS,
    onlyIndices: [2],
  });
  assert.deepEqual(body.only_indices, [2]);
});

test("unwrapStoryboardResponse preserves positional alignment when middle frame url is null", () => {
  const raw = {
    ok: true,
    script: SCRIPT,
    frames: [
      { scene_index: 0, url: "https://cdn/f/0.jpg", key: "k0" },
      { scene_index: 1, url: null, error: "safety_block", key: "k1" },
      { scene_index: 2, url: "https://cdn/f/2.jpg", key: "k2" },
      { scene_index: 3, url: "https://cdn/f/3.jpg", key: "k3" },
    ],
  };
  const r = unwrapStoryboardResponse(raw);
  // No index-shift: shot #2 (the failed one) must remain at position 1, and
  // shot #3's image must still be at position 2 — not compacted upward.
  assert.equal(r.frames.length, 4);
  assert.equal(r.frames[0], "https://cdn/f/0.jpg");
  assert.equal(r.frames[1], null);
  assert.equal(r.frames[2], "https://cdn/f/2.jpg");
  assert.equal(r.frames[3], "https://cdn/f/3.jpg");
});

test("unwrapDirectorPollResponse keeps ROOT-level progress and job.error_message", () => {
  const raw = {
    ok: true,
    progress: 42,
    job: {
      id: "j1",
      status: "running",
      final_video_url: null,
      error_message: "provider timeout",
    },
    shots: [],
  };
  const r = unwrapDirectorPollResponse(raw);
  assert.equal(r.progress, 42); // root, NOT job.progress
  assert.equal(r.job.error_message, "provider timeout");
  assert.equal(r.job.status, "running");
});

test("unwrapDirectorCompleteResponse keeps asset_id for downstream UI state", () => {
  const r = unwrapDirectorCompleteResponse({ ok: true, asset_id: "ast_123" });
  assert.equal(r.asset_id, "ast_123");
  // Pure UI reducer for the JobPanel state — asset_id must survive the merge.
  const jobState = { id: "j1", status: "done", videoUrl: "https://cdn/v/1.mp4" } as {
    id: string; status: string; videoUrl?: string; assetId?: string;
  };
  const next = r.asset_id ? { ...jobState, assetId: r.asset_id } : jobState;
  assert.equal(next.assetId, "ast_123");
});

test("surprise submit defaults realism to 'photoreal' (backend only recognizes photoreal)", () => {
  const preview = buildSurprisePreviewPayload({
    shopId: "s1", videoType: "store_tour", aspect: "9:16", imageUrls: ["u1"],
  });
  assert.equal(preview.realism, "photoreal");

  const submit = buildSurpriseSubmitPayload({
    shopId: "s1", aspect: "9:16",
    preview: { script: SCRIPT, assets: [{ id: "a1", url: "u1" }], style: "steady" },
  });
  assert.equal(submit.realism, "photoreal");
  // And still echoes preview references.
  assert.equal((submit as { script: unknown }).script, SCRIPT);
});