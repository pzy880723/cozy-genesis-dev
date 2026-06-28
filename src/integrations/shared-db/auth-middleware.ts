import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  SHARED_SUPABASE_URL,
  SHARED_SUPABASE_PUBLISHABLE_KEY,
} from "./client";

// requireSupabaseAuth：以用户 JWT 身份构造 server-side supabase client，RLS 全程生效。
// 不引入 service_role。
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const rawAuth = getRequestHeader("authorization");
    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      throw new Response("Unauthorized: No authorization header provided", {
        status: 401,
      });
    }
    const accessToken = rawAuth.slice("Bearer ".length);

    const supabase = createClient<Database>(
      SHARED_SUPABASE_URL,
      SHARED_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    );

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: { supabase, userId: data.user.id, claims: data.user },
    });
  },
);