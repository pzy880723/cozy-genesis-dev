// _shared/cover-generation.ts
// 一键视频「反向提取人物封面」的共享逻辑。
// 语义：Seedance 15s 单段视频 succeeded 且 video_url 存在之后，才把封面任务排队。
// 绝不使用视频第一帧/截图当封面；封面由腾讯云 Cover Worker 用参考帧重绘。

export type CoverCopy = {
  headline: string;
  subtitle: string;
  highlight_keyword: string;
};

export type CoverVariation = {
  people_count: number;
  action: string;
  product: string;
  camera: string;
};

export type CoverGeneration = {
  status: "queued" | "claimed" | "generating" | "succeeded" | "failed";
  attempt: number;
  copy: CoverCopy;
  variation: CoverVariation;
  queued_at?: string;
  claimed_by?: string | null;
  claimed_at?: string | null;
  claim_expires_at?: string | null;
  progress?: number;
  cover_url?: string | null;
  reference_frame_count?: number | null;
  copy_fingerprint?: string | null;
  variation_key?: string | null;
  error?: string | null;
  finished_at?: string | null;
  [k: string]: unknown; // 保留未知字段
};

/** fallback_notes 历史上可能是数组（submitSeedanceSegment 的 notes），必须兼容。 */
export function asNotesObject(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) return { notes: raw };
  if (raw && typeof raw === "object") return { ...(raw as Record<string, unknown>) };
  return {};
}

/** 只合并 cover_generation 这一个键，其余键原样保留。 */
export function mergeCoverGeneration(
  rawNotes: unknown,
  patch: Partial<CoverGeneration>,
): { notes: Record<string, unknown>; cover: CoverGeneration } {
  const notes = asNotesObject(rawNotes);
  const prev = (notes.cover_generation && typeof notes.cover_generation === "object"
    ? notes.cover_generation
    : {}) as Partial<CoverGeneration>;
  const cover = { ...prev, ...patch } as CoverGeneration;
  notes.cover_generation = cover;
  return { notes, cover };
}

export function readCoverGeneration(rawNotes: unknown): CoverGeneration | null {
  const notes = asNotesObject(rawNotes);
  const cg = notes.cover_generation;
  return cg && typeof cg === "object" ? (cg as CoverGeneration) : null;
}

// ---------------- 文案 & 变体 ----------------

const ACTIONS = ["举杯对视", "并肩走进店门", "低头闻香", "递上一杯", "回头轻笑", "落座翻菜单"];
const CAMERAS = ["近景过肩", "中景平视", "低角度仰拍", "俯拍桌面", "侧脸特写"];
const PEOPLE = [1, 2];

function textOf(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 只从脚本 / 已选素材里取商品词，绝不发明脚本外的商品。 */
export function extractProducts(script: any, assets: any[] = []): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && t.length <= 12 && !out.includes(t)) out.push(t);
  };
  for (const key of ["product", "product_name", "highlight", "topic", "title"]) {
    push(textOf(script?.[key]));
  }
  const clips = [script?.hook, ...(Array.isArray(script?.scenes) ? script.scenes : []), script?.outro];
  for (const c of clips) {
    push(textOf(c?.product));
  }
  for (const a of assets) {
    push(textOf(a?.summary ?? a?.meta?.summary ?? a?.meta?.title));
    push(textOf(a?.category ?? a?.meta?.category));
  }
  return out;
}

export function fingerprintCopy(copy: CoverCopy): string {
  return [copy.headline, copy.subtitle, copy.highlight_keyword].join("|").replace(/\s+/g, "");
}

export function variationKey(v: CoverVariation): string {
  return [v.people_count, v.action, v.product, v.camera].join("|");
}

/**
 * 最小历史去重：读该 shop 最近 90 天 marketing_assets.meta 里的封面指纹，
 * 禁止完全相同，并在动作/商品/镜头/人数里选“使用次数最少”的可用组合。
 */
export async function buildCoverPlan(
  admin: any,
  opts: { shopId: string | null; script: any; assets?: any[] },
): Promise<{ copy: CoverCopy; variation: CoverVariation }> {
  const script = opts.script || {};
  const products = extractProducts(script, opts.assets || []);
  const productPool = products.length ? products : [textOf(script.title) || "本店招牌"];

  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  let history: any[] = [];
  if (opts.shopId) {
    const { data } = await admin
      .from("marketing_assets")
      .select("meta, created_at")
      .eq("shop_id", opts.shopId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);
    history = data || [];
  }
  const usedFingerprints = new Set<string>();
  const usedVariationKeys = new Set<string>();
  const count = { action: new Map<string, number>(), camera: new Map<string, number>(), product: new Map<string, number>(), people: new Map<number, number>() };
  const bump = (m: Map<any, number>, k: any) => m.set(k, (m.get(k) || 0) + 1);
  for (const row of history) {
    const cg = (row?.meta || {}).cover_generation || row?.meta || {};
    const fp = textOf(cg.copy_fingerprint);
    if (fp) usedFingerprints.add(fp);
    const vk = textOf(cg.variation_key);
    if (vk) {
      usedVariationKeys.add(vk);
      const [people, action, product, camera] = vk.split("|");
      bump(count.action, action);
      bump(count.camera, camera);
      bump(count.product, product);
      bump(count.people, Number(people));
    }
  }
  const leastUsed = <T>(pool: T[], m: Map<any, number>): T =>
    [...pool].sort((a, b) => (m.get(a) || 0) - (m.get(b) || 0))[0];

  let variation: CoverVariation = {
    people_count: leastUsed(PEOPLE, count.people),
    action: leastUsed(ACTIONS, count.action),
    product: leastUsed(productPool, count.product),
    camera: leastUsed(CAMERAS, count.camera),
  };
  // 组合级避重
  if (usedVariationKeys.has(variationKey(variation))) {
    outer: for (const action of ACTIONS) {
      for (const camera of CAMERAS) {
        for (const product of productPool) {
          for (const people_count of PEOPLE) {
            const cand = { people_count, action, product, camera };
            if (!usedVariationKeys.has(variationKey(cand))) {
              variation = cand;
              break outer;
            }
          }
        }
      }
    }
  }

  const highlight = variation.product;
  const baseHeadline = textOf(script.title) || textOf(script.topic) || highlight;
  const baseSubtitle =
    textOf(script?.hook?.subtitle) || textOf(script?.hook?.dialogue) || textOf(script.highlight) || "到店就有";

  let copy: CoverCopy = {
    headline: baseHeadline.slice(0, 12),
    subtitle: baseSubtitle.slice(0, 16),
    highlight_keyword: highlight.slice(0, 6),
  };
  // 文案指纹避重：换角度（动作词入题），仍然只用脚本里的信息
  if (usedFingerprints.has(fingerprintCopy(copy))) {
    copy = {
      ...copy,
      headline: `${variation.action}·${copy.headline}`.slice(0, 12),
    };
  }
  return { copy, variation };
}

/**
 * 视频 succeeded + video_url 已存在后调用。幂等：已有 cover_generation 则不覆盖。
 * 只写 fallback_notes.cover_generation，不动其它键、不动视频状态。
 */
export async function queueCoverGeneration(
  admin: any,
  job: { id: string; shop_id?: string | null; script?: any; video_url?: string | null; fallback_notes?: unknown },
): Promise<{ queued: boolean; reason?: string }> {
  if (!job?.video_url) return { queued: false, reason: "no_video_url" };
  const existing = readCoverGeneration(job.fallback_notes);
  if (existing?.status) return { queued: false, reason: "already_" + existing.status };

  const { copy, variation } = await buildCoverPlan(admin, {
    shopId: job.shop_id ?? null,
    script: job.script || {},
    assets: Array.isArray((job.script || {}).picked_assets) ? (job.script as any).picked_assets : [],
  });

  const { notes } = mergeCoverGeneration(job.fallback_notes, {
    status: "queued",
    attempt: 0,
    copy,
    variation,
    queued_at: new Date().toISOString(),
    copy_fingerprint: fingerprintCopy(copy),
    variation_key: variationKey(variation),
  });

  const { error } = await admin
    .from("marketing_video_jobs")
    .update({ fallback_notes: notes })
    .eq("id", job.id);
  if (error) return { queued: false, reason: error.message };
  return { queued: true };
}