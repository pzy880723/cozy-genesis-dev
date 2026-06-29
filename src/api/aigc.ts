import { mock } from "./client";
import { assetsApi } from "./assets";
import {
  ALL_CATEGORY,
  brandHighlight,
  getBrandProfile,
  type OneClickVideoType,
} from "./brand";
import type { Asset } from "@/types";

export type GenerateCopyInput = {
  assetIds: string[];
  scope: string;
  platforms: string[];
  notes?: string;
};

export type VideoBrief = {
  shopId: string;
  refAssetIds: string[];
  character: string | null;
  vtype: string;
  style: string;
  duration: number;
  aspect: string;
  highlight: string;
  briefDigest: string;
};

export type GeneratedCopy = {
  title: string;
  body: string;
  tags: string[];
  platformTips: { platform: string; tip: string }[];
};

export type BriefTurn = { role: "user" | "assistant"; content: string; kind?: "ask" | "draft_script" };

export type Scene = {
  id: number;
  time: string;
  visual: string;
  voice: string;
  storyboardUrl?: string;
};

export type Script = {
  title: string;
  scenes: Scene[];
};

export type RenderPhase = "queued" | "scripting" | "rendering" | "stitching" | "done" | "failed";

export type RenderJob = {
  id: string;
  phase: RenderPhase;
  progress: { done: number; total: number };
  videoUrl?: string;
  error?: string;
  startedAt: number;
};

const SAMPLE_VIDEO = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const PIC = (seed: string) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/800`;

export const ONECLICK_MAX_REFS = 9;

export type OneClickPickInput = {
  shopId: string;
  types: OneClickVideoType[];
  category: string;
  max?: number;
};

export type OneClickPickResult = {
  assets: Asset[];
  shortage?: string;
};

export type OneClickGenerateInput = {
  shopId: string;
  types: OneClickVideoType[];
  category: string;
  assetIds: string[];
  aspect: string;
  modelId: string;
};

const TYPE_TAG_HINTS: Record<OneClickVideoType, string[]> = {
  store_tour: ["探店", "门店", "门头", "环境"],
  new_arrival: ["新品", "上新", "上架", "新款"],
  store_ambience: ["氛围", "环境", "灯光", "空镜"],
  brand_intro: ["品牌", "IP", "主视觉"],
  activity: ["活动", "海报", "周末", "促销"],
  customer_review: ["顾客", "试穿", "好评", "评价"],
};

function scoreAsset(a: Asset, types: OneClickVideoType[], category: string): number {
  const tagText = [a.title, ...(a.tags ?? []), a.category ?? ""].join(" ").toLowerCase();
  let s = 0;
  for (const t of types) {
    for (const hint of TYPE_TAG_HINTS[t]) {
      if (tagText.includes(hint.toLowerCase())) s += 3;
    }
  }
  if (category && category !== ALL_CATEGORY) {
    if (tagText.includes(category.toLowerCase())) s += 4;
  }
  // 偏好有缩略图的
  if (a.thumbnailUrl) s += 1;
  return s;
}

export const aigcApi = {
  generateCopy: async (_input: GenerateCopyInput): Promise<GeneratedCopy> => {
    return mock(
      {
        title: "夏日新搭｜BOOMER.OFF 这个周末带你解锁街头新造型",
        body:
          "这个周末，BOOMER.OFF 全新夏季系列上架。\n清爽配色 × 街头剪裁，搭配门店限定活动，邀你一起把热度穿在身上。\n\n📍 门店探店 ｜ 限时礼遇 ｜ 新品试穿",
        tags: ["BOOMEROFF", "夏日穿搭", "周末活动", "街头风", "新品上架"],
        platformTips: [
          { platform: "小红书", tip: "标题前置 emoji，正文分段 + 标签结尾。" },
          { platform: "抖音", tip: "前 3 秒强钩子，搭配热门 BGM。" },
          { platform: "视频号", tip: "突出品牌词与门店地址。" },
          { platform: "快手", tip: "口语化文案，强调福利与限时。" },
        ],
      },
      600,
    );
  },
  generateScript: async (_input: GenerateCopyInput) =>
    mock(
      {
        title: "中信泰富店探店脚本",
        scenes: [
          { id: 1, time: "00:00-00:03", visual: "门店门头特写", voice: "走，今天带你来上海最有梗的潮流门店。" },
          { id: 2, time: "00:03-00:10", visual: "品牌墙 + IP 角色", voice: "BOOMER.OFF，做潮流也做态度。" },
          { id: 3, time: "00:10-00:20", visual: "新品试穿镜头", voice: "夏日新品已经到店，三套搭配现场上身。" },
          { id: 4, time: "00:20-00:28", visual: "结尾活动卡", voice: "本周末到店有礼，记得来打卡。" },
        ],
      },
      700,
    ),

  generateVideoScript: async (input: VideoBrief): Promise<Script> => {
    const sceneCount = input.duration <= 15 ? 3 : input.duration <= 30 ? 4 : input.duration <= 45 ? 5 : 6;
    const per = Math.max(3, Math.round(input.duration / sceneCount));
    const visualsByType: Record<string, string[]> = {
      store_tour: ["门店门头推镜", "品牌墙 + IP 角色", "店内陈列环绕", "顾客试穿特写", "店员介绍新品", "结尾活动卡 + 地址"],
      product_showcase: ["产品开箱特写", "材质细节微距", "上身/使用场景", "搭配组合演示", "对比同类竞品", "结尾购买引导"],
      store_ambience: ["门店外景日落", "灯光氛围空镜", "顾客自然互动", "员工服务细节", "音乐 + 慢镜头", "品牌 Logo 收尾"],
      new_arrival: ["新品包装拆封", "首发吊牌特写", "上身多角度", "搭配灵感推荐", "限时活动卡", "门店地址收尾"],
    };
    const visuals = visualsByType[input.vtype] ?? visualsByType.store_tour;
    const scenes: Scene[] = Array.from({ length: sceneCount }, (_, i) => {
      const start = i * per;
      const end = Math.min(input.duration, start + per);
      const mm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
      return {
        id: i + 1,
        time: `${mm(start)}-${mm(end)}`,
        visual: visuals[i] ?? `镜头 ${i + 1}`,
        voice: i === sceneCount - 1
          ? (input.highlight || "周末到店有礼，记得来打卡。")
          : `${input.style === "playful" ? "嘿，" : ""}${visuals[i] ?? "镜头"}，配合${input.style}节奏。`,
      };
    });
    return mock(
      { title: `${input.vtype} · ${input.aspect} · ${input.duration}s 脚本`, scenes },
      700,
    );
  },

  generateBrief: async (input: { userMsg: string; turn: number }): Promise<BriefTurn> => {
    const replies = [
      { kind: "ask" as const, content: "好。想突出门店氛围、新品、还是活动？大概多长？" },
      { kind: "ask" as const, content: "明白了。主角是店员、顾客还是只拍空镜？" },
      {
        kind: "draft_script" as const,
        content:
          "脚本初稿：\n1) 门店外景 → 推门入店\n2) 主推单品特写 + 顾客试穿\n3) 收尾活动卡 + 门店地址",
      },
    ];
    const pick = replies[Math.min(input.turn, replies.length - 1)];
    return mock({ role: "assistant", kind: pick.kind, content: pick.content }, 500);
  },

  generateStoryboard: async (input: { scenes: Scene[]; onlyIndices?: number[] }): Promise<{ scenes: Scene[] }> => {
    const next = input.scenes.map((s, i) => {
      if (input.onlyIndices && !input.onlyIndices.includes(i)) return s;
      return { ...s, storyboardUrl: PIC(`sb-${s.id}-${Date.now()}-${i}`) };
    });
    return mock({ scenes: next }, 900);
  },

  submitRenderJob: async (_input: {
    shopId: string;
    script: Script;
    brief: VideoBrief;
    modelId: string;
    resolution: string;
    realism: string;
    strategy: string;
  }): Promise<{ jobId: string }> => {
    return mock({ jobId: `job_${Math.random().toString(36).slice(2, 8)}` }, 300);
  },

  pollRenderJob: async (jobId: string, startedAt: number, total: number): Promise<RenderJob> => {
    const elapsed = (Date.now() - startedAt) / 1000;
    let phase: RenderPhase = "queued";
    let done = 0;
    if (elapsed < 1.5) phase = "queued";
    else if (elapsed < 3) { phase = "scripting"; done = 0; }
    else if (elapsed < 9) { phase = "rendering"; done = Math.min(total, Math.floor((elapsed - 3) / 1.5)); }
    else if (elapsed < 11) { phase = "stitching"; done = total; }
    else { phase = "done"; done = total; }
    return mock(
      {
        id: jobId,
        phase,
        progress: { done, total },
        videoUrl: phase === "done" ? SAMPLE_VIDEO : undefined,
        startedAt,
      },
      200,
    );
  },

  // 一键自动挑图：只从「上传」原图中按类型 + 品类打分取 Top N（最多 9）。
  pickAutoAssets: async (input: OneClickPickInput): Promise<OneClickPickResult> => {
    const max = Math.min(input.max ?? ONECLICK_MAX_REFS, ONECLICK_MAX_REFS);
    const all = await assetsApi.list({
      shopId: input.shopId,
      kind: "image",
      source: "upload",
      limit: 120,
    });
    const scored = all
      .map((a) => ({ a, s: scoreAsset(a, input.types, input.category) }))
      // 让没匹配到 tag 的也能进来（保证有图），匹配的优先
      .sort((x, y) => y.s - x.s);
    const picked = scored.slice(0, max).map((x) => x.a);
    const shortage =
      picked.length < max
        ? `仅找到 ${picked.length} 张上传图，可继续生成，或先去素材库上传更多基础图。`
        : undefined;
    return mock({ assets: picked, shortage }, 500);
  },

  // 一键生成：脚本 → 分镜 → 渲染任务，全部串起来。
  oneClickGenerate: async (
    input: OneClickGenerateInput,
  ): Promise<{ jobId: string; script: Script; brief: VideoBrief }> => {
    const profile = getBrandProfile(input.shopId);
    const highlight = brandHighlight(profile, input.types, input.category);
    const primaryType = input.types[0] ?? "store_tour";
    const brief: VideoBrief = {
      shopId: input.shopId,
      refAssetIds: input.assetIds,
      character: null,
      vtype: primaryType,
      style: "lively",
      duration: 15,
      aspect: input.aspect,
      highlight,
      briefDigest: `一键出片 · ${profile.brandName} · ${input.types.join("+")} · ${input.category}`,
    };
    const script = await aigcApi.generateVideoScript(brief);
    const sb = await aigcApi.generateStoryboard({ scenes: script.scenes });
    const finalScript: Script = { title: script.title, scenes: sb.scenes };
    const { jobId } = await aigcApi.submitRenderJob({
      shopId: input.shopId,
      script: finalScript,
      brief,
      modelId: input.modelId,
      resolution: "720p",
      realism: "real",
      strategy: "one_shot",
    });
    return { jobId, script: finalScript, brief };
  },
};