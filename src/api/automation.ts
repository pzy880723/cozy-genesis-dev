import { supabase } from "@/integrations/shared-db/client";
import type { AutomationTask, Platform } from "@/types";
import { publishApi } from "./publish";

export type AutomationInput = {
  name: string;
  scope_type: AutomationTask["scopeType"];
  shop_ids: string[];
  content_kind?: "image_text" | "video" | "copy";
  asset_source?: "mixed" | "ai" | "upload";
  content_strategy?: string;
  platforms: Platform[];
  daily_limit?: number;
  run_times?: string[];
  failure_policy?: "retry_once" | "pause" | "notify";
};

function mapRow(r: any): AutomationTask {
  return {
    id: r.id,
    name: r.name,
    scopeType: r.scope_type,
    shopIds: r.shop_ids ?? [],
    shopNames: r.shop_names ?? [],
    contentStrategy: r.content_strategy ?? `${r.content_kind} · ${r.daily_limit} 条/日`,
    platforms: (r.platforms ?? []) as Platform[],
    dailyLimit: r.daily_limit ?? 1,
    runTimes: r.run_times ?? [],
    status: r.status,
    lastRunAt: r.last_run_at ?? undefined,
    nextRunAt: r.next_run_at ?? undefined,
  };
}

async function attachShopNames(rows: any[]): Promise<any[]> {
  const ids = Array.from(new Set(rows.flatMap((r) => r.shop_ids ?? []))) as string[];
  if (!ids.length) return rows;
  const { data } = await supabase.from("shops").select("id,name").in("id", ids);
  const m = new Map((data ?? []).map((s) => [s.id, s.name]));
  return rows.map((r) => ({
    ...r,
    shop_names: (r.shop_ids ?? []).map((id: string) => m.get(id) ?? id),
  }));
}

export const automationApi = {
  list: async (): Promise<AutomationTask[]> => {
    const { data, error } = await supabase
      .from("automation_tasks" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      // 42P01 = relation does not exist：migration 未执行
      if (String((error as any).code) === "42P01") {
        const err = new Error("automation_tasks 表不存在，请先在共享库执行 docs/migrations/2026-06-29-publish-center.sql");
        (err as any).code = "MIGRATION_REQUIRED";
        throw err;
      }
      throw error;
    }
    const withNames = await attachShopNames((data as any[]) ?? []);
    return withNames.map(mapRow);
  },

  create: async (input: AutomationInput): Promise<AutomationTask> => {
    const { data: u } = await supabase.auth.getUser();
    const insert = {
      name: input.name,
      scope_type: input.scope_type,
      shop_ids: input.shop_ids,
      content_kind: input.content_kind ?? "image_text",
      asset_source: input.asset_source ?? "mixed",
      content_strategy: input.content_strategy ?? null,
      platforms: input.platforms,
      daily_limit: input.daily_limit ?? 1,
      run_times: input.run_times ?? ["10:00"],
      failure_policy: input.failure_policy ?? "retry_once",
      status: "enabled",
      created_by: u.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from("automation_tasks" as any)
      .insert(insert)
      .select("*")
      .single();
    if (error) throw error;
    const [withNames] = await attachShopNames([data as any]);
    return mapRow(withNames);
  },

  update: async (id: string, patch: Partial<AutomationTask> & { status?: AutomationTask["status"] }) => {
    const dbPatch: any = {};
    if (patch.status) dbPatch.status = patch.status;
    if (patch.name) dbPatch.name = patch.name;
    if (patch.platforms) dbPatch.platforms = patch.platforms;
    if (patch.dailyLimit) dbPatch.daily_limit = patch.dailyLimit;
    if (patch.runTimes) dbPatch.run_times = patch.runTimes;
    dbPatch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("automation_tasks" as any).update(dbPatch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  },

  remove: async (id: string) => {
    const { error } = await supabase.from("automation_tasks" as any).delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  },

  runNow: async (id: string) => {
    const { data, error } = await supabase
      .from("automation_tasks" as any)
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    const t = data as any;

    // Worker 还没接：直接合成一条 social_publish_jobs 进队列
    await publishApi.create({
      title: `[自动] ${t.name}`,
      scopeType: t.scope_type,
      shopIds: t.shop_ids,
      platforms: t.platforms,
      contentType: t.content_kind,
      assetIds: [],
      copy: {
        title: `[自动] ${t.name}`,
        body: t.content_strategy ?? "",
        tags: [],
      },
      automationTaskId: t.id,
    });
    await supabase
      .from("automation_tasks" as any)
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: true };
  },
};