import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// 共享 Supabase 项目（Genie / 营销中心），ref: narqwgwpqglathwtyevz
// 公开值（URL + publishable/anon key），硬编码安全。
// anon key 待用户从 Supabase Dashboard → Project Settings → API 复制后替换。
export const SHARED_SUPABASE_URL = "https://narqwgwpqglathwtyevz.supabase.co";
export const SHARED_SUPABASE_PUBLISHABLE_KEY = "__REPLACE_WITH_ANON_KEY__";
export const SHARED_SUPABASE_PROJECT_ID = "narqwgwpqglathwtyevz";

export const supabase = createClient<Database>(
  SHARED_SUPABASE_URL,
  SHARED_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);