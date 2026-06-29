import { supabase } from "@/integrations/shared-db/client";
import type { Platform, PublishJob, PublishTarget } from "@/types";

export type CreateJobInput = {
  title: string;
  scopeType: "hq" | "store" | "multi_store";
  shopIds: string[];
  platforms: Platform[];
  contentType: "video" | "image_text" | "copy";
  assetIds: string[];
  copy?: { title: string; body: string; tags: string[] };
  scheduledAt?: string;
};

export type CreateJobResult = {
  ok: boolean;
  jobId: string;
  targetCount: number;
  missing: { shopId: string; platform: Platform }[];
};

type JobRow = {
  id: string;
  shop_id: string;
  title: string | null;
  kind: string;
  status: string;
  schedule_at: string | null;
  created_at: string;
  per_platform: any;
  shops?: { name: string | null } | null;
  social_publish_targets?: TargetRow[];
};

type TargetRow = {
  id: string;
  job_id: string;
  platform: string;
  account_id: string;
  status: string;
  progress: number | null;
  last_step: string | null;
  error_message: string | null;
  platform_post_url: string | null;
  retry_count: number | null;
  social_accounts?: { account_name: string | null; platform: string } | null;
};

const TERMINAL = new Set(["success", "failed", "cancelled"]);

function mapTarget(t: TargetRow): PublishTarget {
  const s = t.status;
  const uiStatus: PublishTarget["status"] =
    s === "success"
      ? "success"
      : s === "failed"
        ? "failed"
        : s === "pending" || s === "queued"
          ? "queued"
          : "running";
  return {
    id: t.id,
    jobId: t.job_id,
    platform: t.platform as Platform,
    accountId: t.account_id,
    accountName: t.social_accounts?.account_name ?? "未命名账号",
    status: uiStatus,
    errorMessage: t.error_message ?? undefined,
    publishedUrl: t.platform_post_url ?? undefined,
  };
}

function mapJob(row: JobRow): PublishJob {
  const targets = (row.social_publish_targets ?? []).map(mapTarget);
  const per = (row.per_platform ?? {}) as any;
  const shopIds: string[] = Array.isArray(per?.shop_ids) ? per.shop_ids : [row.shop_id];
  const shopNames: string[] = Array.isArray(per?.shop_names) ? per.shop_names : [];
  const scopeType: PublishJob["scopeType"] =
    per?.scope_type === "hq" || per?.scope_type === "store" || per?.scope_type === "multi_store"
      ? per.scope_type
      : "store";
  const status = row.status as PublishJob["status"];
  return {
    id: row.id,
    title: row.title ?? "(未命名任务)",
    scopeType,
    shopIds,
    shopNames: shopNames.length ? shopNames : row.shops?.name ? [row.shops.name] : [],
    contentType: (row.kind as PublishJob["contentType"]) ?? "image_text",
    status,
    createdAt: row.created_at,
    scheduledAt: row.schedule_at ?? undefined,
    targets,
  };
}

const SELECT = `
  id, shop_id, title, kind, status, schedule_at, created_at, per_platform,
  shops:shop_id ( name ),
  social_publish_targets (
    id, job_id, platform, account_id, status, progress, last_step,
    error_message, platform_post_url, retry_count,
    social_accounts:account_id ( account_name, platform )
  )
`;

export const publishApi = {
  list: async (): Promise<PublishJob[]> => {
    const { data, error } = await supabase
      .from("social_publish_jobs")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;
    return (data ?? []).map((r) => mapJob(r as any));
  },

  detail: async (jobId: string): Promise<PublishJob | null> => {
    const { data, error } = await supabase
      .from("social_publish_jobs")
      .select(SELECT)
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapJob(data as any) : null;
  },

  create: async (input: CreateJobInput): Promise<CreateJobResult> => {
    if (!input.shopIds.length) throw new Error("缺少发布范围");
    if (!input.platforms.length) throw new Error("至少选择一个平台");

    // 1) 拉可用账号
    const { data: accs, error: accErr } = await supabase
      .from("social_accounts")
      .select("id, shop_id, platform, cookie_status, account_name")
      .in("shop_id", input.shopIds)
      .in("platform", input.platforms)
      .eq("cookie_status", "valid");
    if (accErr) throw accErr;

    const picks: { shop_id: string; platform: Platform; account_id: string }[] = [];
    const missing: { shopId: string; platform: Platform }[] = [];
    for (const sId of input.shopIds) {
      for (const p of input.platforms) {
        const a = (accs ?? []).find((x) => x.shop_id === sId && x.platform === p);
        if (a) picks.push({ shop_id: sId, platform: p, account_id: a.id });
        else missing.push({ shopId: sId, platform: p });
      }
    }

    // 2) 取门店名做展示
    const { data: shopsRows } = await supabase
      .from("shops")
      .select("id, name")
      .in("id", input.shopIds);
    const shopNames = (shopsRows ?? []).map((s) => s.name);

    // 3) 插 job
    const { data: userData } = await supabase.auth.getUser();
    const jobInsert = {
      shop_id: input.shopIds[0],
      kind: input.contentType,
      title: input.copy?.title ?? input.title,
      body: input.copy?.body ?? null,
      tags: input.copy?.tags ?? [],
      schedule_at: input.scheduledAt ?? null,
      status: "queued",
      per_platform: {
        scope_type: input.scopeType,
        shop_ids: input.shopIds,
        shop_names: shopNames,
        platforms: input.platforms,
        asset_ids: input.assetIds,
        missing,
      } as any,
      created_by: userData.user?.id ?? null,
    };
    const { data: jobRow, error: jobErr } = await supabase
      .from("social_publish_jobs")
      .insert(jobInsert)
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    // 4) 插 targets
    if (picks.length) {
      const rows = picks.map((p) => ({
        job_id: jobRow.id,
        account_id: p.account_id,
        platform: p.platform,
        status: "pending" as const,
      }));
      const { error: tErr } = await supabase.from("social_publish_targets").insert(rows);
      if (tErr) throw tErr;
    }

    return { ok: true, jobId: jobRow.id, targetCount: picks.length, missing };
  },

  retryTarget: async (targetId: string) => {
    const { data: cur, error: e1 } = await supabase
      .from("social_publish_targets")
      .select("retry_count")
      .eq("id", targetId)
      .single();
    if (e1) throw e1;
    const { error } = await supabase
      .from("social_publish_targets")
      .update({
        status: "pending",
        error_message: null,
        last_step: null,
        progress: 0,
        retry_count: (cur?.retry_count ?? 0) + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", targetId);
    if (error) throw error;
    return { ok: true, targetId };
  },

  cancel: async (jobId: string) => {
    const { error: e1 } = await supabase
      .from("social_publish_jobs")
      .update({ status: "cancelled" })
      .eq("id", jobId);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from("social_publish_targets")
      .update({ status: "cancelled" })
      .eq("job_id", jobId)
      .not("status", "in", `(${Array.from(TERMINAL).map((s) => `"${s}"`).join(",")})`);
    if (e2) throw e2;
    return { ok: true, jobId };
  },
};