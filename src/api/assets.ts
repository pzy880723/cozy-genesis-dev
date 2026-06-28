import type { Asset, AssetKind } from "@/types";
import { supabase } from "@/integrations/shared-db/client";

export type AssetFilters = {
  shopId?: string | "all";
  kind?: AssetKind | "all";
  source?: "upload" | "ai" | "all";
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
    let q = supabase
      .from("marketing_assets")
      .select(
        "id,shop_id,kind,category,tags,output_url,output_text,published_at,created_at,meta,shops(name)",
      )
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
    const limit = filters.limit ?? 120;
    const offset = filters.offset ?? 0;
    q = q.range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) throw error;

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
      const title: string =
        meta.title ??
        (r.output_text ? String(r.output_text).slice(0, 30) : "未命名素材");
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
        publishedAt: r.published_at,
        createdAt: r.created_at,
      };
    });

    if (filters.source && filters.source !== "all") {
      out = out.filter((a) => a.source === filters.source);
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