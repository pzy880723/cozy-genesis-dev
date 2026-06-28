import type { Asset, AssetKind } from "@/types";
import { supabase } from "@/integrations/shared-db/client";

export type AssetFilters = {
  shopId?: string | "all";
  kind?: AssetKind | "all";
  source?: "upload" | "ai" | "all";
  search?: string;
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

export const assetsApi = {
  list: async (filters: AssetFilters = {}): Promise<Asset[]> => {
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
      q = q.eq("kind", uiKindToDb(filters.kind));
    }
    const { data, error } = await q;
    if (error) throw error;

    let out: Asset[] = (data ?? []).map((r: any) => {
      const meta = (r.meta ?? {}) as Record<string, any>;
      const kind: AssetKind = dbKindToUi(r.kind);
      const source: "upload" | "ai" =
        meta.source === "upload" ? "upload" : "ai";
      const title: string =
        meta.title ??
        (r.output_text ? String(r.output_text).slice(0, 30) : "未命名素材");
      return {
        id: r.id,
        shopId: r.shop_id,
        shopName: r.shops?.name,
        kind,
        title,
        thumbnailUrl: r.output_url ?? undefined,
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