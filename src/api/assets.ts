import type { Asset, AssetKind, AssetOrigin } from "@/types";
import { supabase } from "@/integrations/shared-db/client";

export type AssetFilters = {
  shopId?: string | "all";
  kind?: AssetKind | "all";
  source?: "upload" | "ai" | "all";
  origin?: AssetOrigin | "all";
  search?: string;
  limit?: number;
  offset?: number;
};

const ALLOWED_KINDS: AssetKind[] = [
  "image",
  "video",
  "copy",
  "storyboard",
  "character",
  "product",
];

// DB 里 kind 是 photo/video/copy（共享库的命名），前端用 image/video/copy/...，做一次映射。
function uiKindToDb(k: AssetKind): string {
  if (k === "image") return "photo";
  return k;
}
function dbKindToUi(k: string): AssetKind {
  if (k === "photo") return "image";
  if (ALLOWED_KINDS.includes(k as AssetKind)) return k as AssetKind;
  return "image";
}

// 把 Supabase Storage 的 public object URL 改写成 image transform 缩略图
// .../storage/v1/object/public/...  -> .../storage/v1/render/image/public/...?width=400&quality=70
export function thumb(url: string | null | undefined, width = 400): string | undefined {
  if (!url) return undefined;
  try {
    if (url.includes("/storage/v1/object/public/")) {
      const u = new URL(url);
      u.pathname = u.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/",
      );
      u.searchParams.set("width", String(width));
      u.searchParams.set("quality", "70");
      return u.toString();
    }
  } catch {
    // ignore
  }
  return url;
}

let _diagPrinted = false;
async function printDiagnosticsOnce() {
  if (_diagPrinted) return;
  _diagPrinted = true;
  try {
    const { data } = await supabase
      .from("marketing_assets")
      .select("kind,category")
      .limit(500);
    const kinds = new Set<string>();
    const cats = new Set<string>();
    (data ?? []).forEach((r: any) => {
      if (r.kind) kinds.add(r.kind);
      if (r.category) cats.add(r.category);
    });
    // eslint-disable-next-line no-console
    console.debug("[assets] distinct kinds:", [...kinds], "categories:", [...cats]);
  } catch (e) {
    // ignore
  }
}

export const assetsApi = {
  list: async (filters: AssetFilters = {}): Promise<Asset[]> => {
    void printDiagnosticsOnce();
    // 注意：origin 字段为后加的列，存量数据库可能尚未有此列。
    // 这里先尝试带 origin 查询，失败则降级为不带 origin 的查询，并把所有行当成 mobile。
    const baseSelect =
      "id,shop_id,kind,category,tags,output_url,output_text,published_at,created_at,meta,shops(name)";
    const selectWithOrigin = `${baseSelect},origin`;
    let useOrigin = true;
    let q = supabase
      .from("marketing_assets")
      .select(selectWithOrigin)
      .order("created_at", { ascending: false });
    if (filters.shopId && filters.shopId !== "all") {
      q = q.eq("shop_id", filters.shopId);
    }
    if (filters.kind && filters.kind !== "all") {
      // image/video/copy 直接用 db.kind；storyboard/character/product 走 category
      const k = filters.kind;
      if (k === "storyboard" || k === "character" || k === "product") {
        q = q.eq("category", k);
      } else {
        q = q.eq("kind", uiKindToDb(k));
      }
    }
    if (filters.origin && filters.origin !== "all") {
      // origin 列是后加的，types.ts 还未包含，绕过类型检查
      q = (q as any).eq("origin", filters.origin);
    }
    const limit = filters.limit ?? 120;
    const offset = filters.offset ?? 0;
    q = q.range(offset, offset + limit - 1);
    let { data, error } = await q;
    if (error) {
      // origin 列不存在时降级
      const msg = String(error.message ?? "");
      if (msg.includes("origin")) {
        useOrigin = false;
        let q2 = supabase
          .from("marketing_assets")
          .select(baseSelect)
          .order("created_at", { ascending: false });
        if (filters.shopId && filters.shopId !== "all") q2 = q2.eq("shop_id", filters.shopId);
        if (filters.kind && filters.kind !== "all") {
          const k = filters.kind;
          if (k === "storyboard" || k === "character" || k === "product") q2 = q2.eq("category", k);
          else q2 = q2.eq("kind", uiKindToDb(k));
        }
        q2 = q2.range(offset, offset + limit - 1);
        const r2 = await q2;
        if (r2.error) throw r2.error;
        data = r2.data as any;
        // 当 origin 列还没建好时，如果用户筛了 pc，就直接返回空（避免误把存量当 pc）
        if (filters.origin === "pc") return [];
      } else {
        throw error;
      }
    }

    let out: Asset[] = (data ?? []).map((r: any) => {
      const meta = (r.meta ?? {}) as Record<string, any>;
      // 优先用 category（storyboard/character/product），否则用 kind
      const catAsKind =
        r.category === "storyboard" || r.category === "character" || r.category === "product"
          ? (r.category as AssetKind)
          : null;
      const kind: AssetKind = catAsKind ?? dbKindToUi(r.kind);
      const source: "upload" | "ai" =
        meta.source === "upload" ? "upload" : "ai";
      const origin: AssetOrigin = useOrigin
        ? (r.origin === "pc" ? "pc" : "mobile")
        : "mobile";
      const title: string =
        meta.title ??
        (r.output_text ? String(r.output_text).slice(0, 30) : "");
      // 视频优先用 meta 里可能存在的封面字段
      const videoPoster: string | undefined =
        meta.thumbnail_url ?? meta.poster ?? meta.cover_url ?? meta.cover;
      const rawThumb =
        kind === "video" ? videoPoster ?? r.output_url : r.output_url;
      return {
        id: r.id,
        shopId: r.shop_id,
        shopName: r.shops?.name,
        kind,
        title,
        thumbnailUrl: thumb(rawThumb ?? undefined),
        outputUrl: r.output_url ?? undefined,
        text: r.output_text ?? undefined,
        tags: r.tags ?? [],
        category: r.category ?? undefined,
        source,
        origin,
        publishedAt: r.published_at,
        createdAt: r.created_at,
      };
    });

    if (filters.source && filters.source !== "all") {
      out = out.filter((a) => a.source === filters.source);
    }
    // 当 origin 列不存在时，上面已 early return；这里是冗余保险。
    if (filters.origin && filters.origin !== "all") {
      out = out.filter((a) => a.origin === filters.origin);
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      out = out.filter(
        (a) =>
          a.title.toLowerCase().includes(s) ||
          a.tags.some((t) => t.toLowerCase().includes(s)),
      );
    }
    return out;
  },
};