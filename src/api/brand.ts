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
    brandName: "BOOMER·OFF（总部）",
    brandIntro:
      "BOOMER·OFF 是国内首家标准化中古连锁品牌，覆盖日本与欧洲中古杂货，1950s–千禧年初。30,000+ SKU、6.9 元起、平价、海量、可信赖；不做高冷精品，不做拍卖，不做潮牌炒货。",
    brandTone: "克制 · 有质感 · 像随手记",
    categories: [
      "日本中古瓷器",
      "趣味玩具",
      "IP 玩偶",
      "黑胶唱片",
      "中古数码",
      "中古杂货",
      "欧洲中古小物",
    ],
  },
  shop_zxth: {
    shopId: "shop_zxth",
    brandName: "BOOMER·OFF · 上海中信泰富店",
    brandIntro:
      "南京西路中信泰富广场 B1 旗舰，无门面通透铺位（无门框、无门头墙、开放式陈列）。汇集日本与欧洲的中古瓷器、趣味玩具、顶流 IP 玩偶、黑胶、中古数码等各式杂货，6.9 元起的平价中古寻宝乐园。",
    brandTone: "克制 · 有质感 · 像随手记",
    categories: [
      "日本中古瓷器",
      "趣味玩具",
      "IP 玩偶",
      "黑胶唱片",
      "中古数码",
      "中古杂货",
      "欧洲中古小物",
    ],
    primaryCategory: "日本中古瓷器",
  },
  shop_mh728: {
    shopId: "shop_mh728",
    brandName: "BOOMER·OFF · 闵行 728 总部",
    brandIntro:
      "总部及货品中转中心（非零售），用于内容拍摄与培训素材；可作为产品展示 / 新品上架类内容的取景地。",
    brandTone: "克制 · 内部 · 纪实",
    categories: [
      "日本中古瓷器",
      "趣味玩具",
      "IP 玩偶",
      "黑胶唱片",
      "中古数码",
      "中古杂货",
      "欧洲中古小物",
    ],
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

// 大类视频类型 · 与 BOOMER·OFF 品牌文档「十、视频内容规则」四类必做对齐
export const ONECLICK_VIDEO_TYPES = [
  { v: "store_tour", label: "探店（主推）" },
  { v: "product_showcase", label: "产品展示" },
  { v: "store_ambience", label: "店铺氛围" },
  { v: "new_arrival", label: "新品上架" },
] as const;

export type OneClickVideoType = (typeof ONECLICK_VIDEO_TYPES)[number]["v"];

export const ALL_CATEGORY = "__all__";

// BOOMER·OFF 品牌文档「十二、商品类目」全量池
export const BOOMER_CATEGORY_POOL = [
  "日本中古瓷器",
  "趣味玩具",
  "IP 玩偶",
  "黑胶唱片",
  "中古数码",
  "中古杂货",
  "欧洲中古小物",
];

export function buildCategoryOptions(profile: BrandProfile): { v: string; label: string }[] {
  const merged = new Set<string>([...profile.categories, ...BOOMER_CATEGORY_POOL]);
  return [
    { v: ALL_CATEGORY, label: "全品类" },
    ...Array.from(merged).map((c) => ({ v: c, label: c })),
  ];
}

export function brandHighlight(
  profile: BrandProfile,
  type: OneClickVideoType,
  category: string,
): string {
  const typeLabel = ONECLICK_VIDEO_TYPES.find((x) => x.v === type)?.label ?? type;
  const cat = category === ALL_CATEGORY ? "全品类" : category;
  return [
    `【品牌】${profile.brandName}`,
    `【语调】${profile.brandTone}`,
    `【品牌介绍】${profile.brandIntro}`,
    `【本片类型】${typeLabel}`,
    `【倾向品类】${cat}`,
    `【内容铁律】100% 简体中文；不编造价格/年代/产地/品牌/材质；禁词：主播、直播间、保真、秒杀、全网最低、拍卖行级别、独家供应商；称呼用「你/您/店员」，不用「宝宝们/家人们」；不喊话、不带货式叫卖。`,
    `【视觉风格】真人写实纪实风（非插画、非动漫）；暖光 / 电影级三点布光；中焦 + 微距；胶片颗粒。`,
    `【硬约束】商场内门店，无门框、无户外；探店类首镜必须是门头（BOOMER·OFF 招牌或店铺入口）。`,
  ].join("\n");
}