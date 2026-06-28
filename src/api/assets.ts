import { mockAssets } from "@/mocks/data";
import type { Asset, AssetKind } from "@/types";
import { mock } from "./client";

export type AssetFilters = {
  shopId?: string | "all";
  kind?: AssetKind | "all";
  source?: "upload" | "ai" | "all";
  search?: string;
};

export const assetsApi = {
  list: async (filters: AssetFilters = {}): Promise<Asset[]> => {
    let out = await mock(mockAssets);
    if (filters.shopId && filters.shopId !== "all") {
      out = out.filter((a) => a.shopId === filters.shopId);
    }
    if (filters.kind && filters.kind !== "all") {
      out = out.filter((a) => a.kind === filters.kind);
    }
    if (filters.source && filters.source !== "all") {
      out = out.filter((a) => a.source === filters.source);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return out;
  },
};