import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectorCreatePayload,
  buildSurprisePreviewPayload,
  buildSurpriseSubmitPayload,
  DEFAULT_DIRECTOR_MODEL,
  type DirectorScript,
  type MarketingCharacter,
  type PickedAssetRef,
} from "../src/api/director-payload";

const SCRIPT: DirectorScript = {
  title: "探店 · 30s",
  shots: [
    { shot_index: 0, duration_s: 6, scene: "门头", action: "推镜", dialogue: "开场", subtitle: "开场", image_index: 0 },
    { shot_index: 1, duration_s: 8, scene: "货架", action: "环绕", dialogue: "承接", subtitle: "承接", image_index: 1 },
    { shot_index: 2, duration_s: 7, scene: "试戴", action: "特写", dialogue: "细节", subtitle: "细节", image_index: 2 },
    { shot_index: 3, duration_s: 9, scene: "结尾", action: "拉远", dialogue: "结尾", subtitle: "结尾", image_index: null },
  ],
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
  // Script is passed through verbatim — do NOT collapse into 3×5s.
  assert.equal(body.script, SCRIPT);
  assert.equal((body.script as DirectorScript).shots.length, 4);
  assert.deepEqual((body.script as DirectorScript).shots.map((s) => s.duration_s), [6, 8, 7, 9]);
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

test("surprise (BOOMER 帮我拍) uses the single 15s preview=false path, not director-create-job", () => {
  const preview = buildSurprisePreviewPayload({
    shopId: "shop_zxth",
    videoType: "store_tour",
    aspect: "9:16",
    imageUrls: ["https://cdn/x/1.jpg", "https://cdn/x/2.jpg"],
  });
  assert.equal(preview.preview, true);
  assert.equal(preview.duration, 15);

  const submit = buildSurpriseSubmitPayload({
    shopId: "shop_zxth",
    videoType: "store_tour",
    aspect: "9:16",
    imageUrls: ["https://cdn/x/1.jpg", "https://cdn/x/2.jpg"],
  });
  assert.equal(submit.preview, false);
  assert.equal(submit.duration, 15);
  assert.equal(submit.video_type, "store_tour");
  assert.deepEqual(submit.image_urls, ["https://cdn/x/1.jpg", "https://cdn/x/2.jpg"]);
  // Ensure the surprise submit body does NOT carry director-only fields —
  // this flow must remain a single-shot 15s Seedance render.
  assert.ok(!("script" in submit), "surprise submit must not include a director script");
  assert.ok(!("picked_assets" in submit), "surprise submit must not include picked_assets");
  assert.ok(!("character_mode" in submit), "surprise submit must not include character_mode");
});