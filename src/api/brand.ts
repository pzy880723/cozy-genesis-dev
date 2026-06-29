// 品牌资料（设计依据）
// 临时方案：前端常量字典 + getBrandProfile() 查询；后续可对接 Supabase shops 表新增字段。

export type BrandProfile = {
  shopId: string;
  brandName: string;
  brandIntro: string;
  brandTone: string;
  categories: string[];
  primaryCategory?: string;
};

const PROFILES: Record<string, BrandProfile> = {
  hq: {
    shopId: "hq",
    brandName: "BOOMER.OFF",
    brandIntro:
      "BOOMER.OFF 是一个聚焦城市青年生活方式的潮流集合品牌。我们做潮流，也做态度，把街头剪裁、IP 联名和门店体验串成一条线。",
    brandTone: "街头 · 自信 · 微幽默",
    categories: ["服饰", "鞋履", "配饰", "IP 联名"],
    primaryCategory: "服饰",
  },
  shop_zxth: {
    shopId: "shop_zxth",
    brandName: "瓷器天堂 · 中信泰富店",
    brandIntro:
      "瓷器天堂以「东方器物 · 当代生活」为主张，主营景德镇手作瓷器、茶器与香器。中信泰富店紧邻陆家嘴，主打高端商务礼赠与茶席体验。",
    brandTone: "国风 · 沉稳 · 治愈",
    categories: ["瓷器", "茶具", "香器", "礼盒"],
    primaryCategory: "瓷器",
  },
  shop_mh728: {
    shopId: "shop_mh728",
    brandName: "玩具天堂 · 闵行 728",
    brandIntro:
      "玩具天堂面向 18-35 岁玩家与亲子家庭，覆盖潮玩盲盒、毛绒玩偶、黑胶唱片与数码周边四大主线，强调「治愈感」与「收藏感」并重。",
    brandTone: "治愈 · 俏皮 · 有梗",
    categories: ["玩偶", "潮玩盲盒", "黑胶", "数码"],
    primaryCategory: "玩偶",
  },
  shop_njxjk: {
    shopId: "shop_njxjk",
    brandName: "BOOMER.OFF · 南京新街口",
    brandIntro:
      "南京新街口旗舰，承担华东区新品首发与社群活动，以街头潮流与本地化设计联名为主。",
    brandTone: "潮流 · 年轻 · 在地",
    categories: ["服饰", "鞋履", "联名"],
    primaryCategory: "服饰",
  },
  shop_jaza: {
    shopId: "shop_jaza",
    brandName: "BOOMER.OFF · 静安店",
    brandIntro:
      "静安店主打日常通勤与轻潮风格，承接街区社群与品牌沙龙，定期联动咖啡与音乐场景。",
    brandTone: "轻潮 · 日常 · 文艺",
    categories: ["服饰", "配饰", "周边"],
    primaryCategory: "服饰",
  },
};

const FALLBACK: Omit<BrandProfile, "shopId"> = {
  brandName: "未配置品牌",
  brandIntro: "暂未在后台配置品牌资料。前往「系统设置 · 品牌知识库」补充后，AI 会按资料设计画面、旁白与角色。",
  brandTone: "中性 · 友好",
  categories: ["全品类"],
  primaryCategory: undefined,
};

export function getBrandProfile(shopId: string | null | undefined): BrandProfile {
  if (shopId && PROFILES[shopId]) return PROFILES[shopId];
  return { shopId: shopId ?? "", ...FALLBACK };
}

// 大类视频类型（不含细分品类）
export const ONECLICK_VIDEO_TYPES = [
  { v: "store_tour", label: "探店" },
  { v: "new_arrival", label: "上新" },
  { v: "store_ambience", label: "环境" },
  { v: "brand_intro", label: "品牌介绍" },
  { v: "activity", label: "活动" },
  { v: "customer_review", label: "顾客好评" },
] as const;

export type OneClickVideoType = (typeof ONECLICK_VIDEO_TYPES)[number]["v"];

export const ALL_CATEGORY = "__all__";

export function buildCategoryOptions(profile: BrandProfile): { v: string; label: string }[] {
  return [
    { v: ALL_CATEGORY, label: "全品类" },
    ...profile.categories.map((c) => ({ v: c, label: c })),
  ];
}

export function brandHighlight(
  profile: BrandProfile,
  types: OneClickVideoType[],
  category: string,
): string {
  const typeLabels = types
    .map((t) => ONECLICK_VIDEO_TYPES.find((x) => x.v === t)?.label ?? t)
    .join(" / ");
  const cat = category === ALL_CATEGORY ? "全品类" : category;
  return [
    `【品牌】${profile.brandName}`,
    `【语调】${profile.brandTone}`,
    `【品牌介绍】${profile.brandIntro}`,
    `【本片类型】${typeLabels}`,
    `【倾向品类】${cat}`,
  ].join("\n");
}