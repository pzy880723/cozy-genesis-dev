import { supabase } from "@/integrations/shared-db/client";
import type { Platform, SocialAccount } from "@/types";

export type AccountFilters = {
  shopIds?: string[];
  platforms?: Platform[];
};

function mapStatus(s: string): SocialAccount["status"] {
  if (s === "valid") return "valid";
  if (s === "expired") return "expired";
  if (s === "disabled") return "disabled";
  return "checking";
}

export const accountsApi = {
  list: async (filters: AccountFilters = {}): Promise<SocialAccount[]> => {
    let q = supabase
      .from("social_accounts")
      .select("id, shop_id, platform, account_name, cookie_status, last_check_at, shops:shop_id(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filters.shopIds?.length) q = q.in("shop_id", filters.shopIds);
    if (filters.platforms?.length) q = q.in("platform", filters.platforms);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      ownerType: "store",
      ownerId: r.shop_id,
      ownerName: r.shops?.name ?? undefined,
      platform: r.platform as Platform,
      displayName: r.account_name ?? "未命名账号",
      status: mapStatus(r.cookie_status),
      lastCheckedAt: r.last_check_at ?? undefined,
    }));
  },

  startLogin: async (input: {
    ownerId: string;
    platform: Platform;
    displayName: string;
  }) => {
    // Worker 还没接，先返回占位 session
    return { sessionId: `login_${Date.now()}`, qrCodeUrl: "", ...input };
  },
};