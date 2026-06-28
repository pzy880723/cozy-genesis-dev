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
};