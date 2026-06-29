import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/shared-db/types";
import { SHARED_SUPABASE_URL } from "@/integrations/shared-db/client";

// Service-role 客户端：仅在 server route / server fn handler 内部 import 调用。
// 用于 Worker 匿名回调写库（绕过 RLS）和 cron-tick 领单。
let _admin: SupabaseClient<Database> | null = null;

export function getSharedAdmin(): SupabaseClient<Database> {
  if (_admin) return _admin;
  const key = process.env.SHARED_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SHARED_SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  _admin = createClient<Database>(SHARED_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}