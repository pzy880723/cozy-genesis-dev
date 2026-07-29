import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectorCreatePayload,
  buildDirectorCompletePayload,
  buildSurprisePreviewPayload,
  buildSurpriseSubmitPayload,
  clipsFromScript,
  DEFAULT_DIRECTOR_MODEL,
  mapSurprisePollStatus,
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
  { id: "a1", url: "https://cdn/x/1.jpg", thumbnail_url: "https://cdn/x/1.t.jpg" },
  { id: "a2", url: "https://cdn/x/2.jpg", thumbnail_url: null },
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
    frames: ["https://cdn/f/1.jpg", { url: "https://cdn/f/2.jpg" }],
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