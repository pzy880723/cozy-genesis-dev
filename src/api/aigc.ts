import { mock } from "./client";

export type GenerateCopyInput = {
  assetIds: string[];
  scope: string;
  platforms: string[];
  notes?: string;
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
};