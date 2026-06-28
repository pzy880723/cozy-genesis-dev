import type { Shop } from "@/types";
import { supabase } from "@/integrations/shared-db/client";

export const shopsApi = {
  list: async (): Promise<Shop[]> => {
    const { data, error } = await supabase
      .from("shops")
      .select("id,name,active")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      active: s.active,
      type: "store",
    }));
  },
};