# First Steps 接入共享 Supabase 数据库 — 落地手册

> 把本文件**整段**粘贴到 First Steps 项目的 Lovable 对话里，让那边的 Agent 按 §8 清单执行。
> 共享的 Supabase 项目 ref：`narqwgwpqglathwtyevz`。本次方案：**只用浏览器端 client**，所有写操作走 RLS + Edge Function，不下发 service_role；Phase 2 总部表暂不动；`types.ts` 手动同步。

---

## 0. 前置警告（First Steps Agent 必读）

- ❌ **不要**在 First Steps 调用 `supabase--enable` / 点 "Enable Lovable Cloud"。一旦执行，Lovable 会为 First Steps 开一个**全新的独立数据库**，与共享库无关，且后续难以回滚。
- 如果之前已经误开了 Lovable Cloud：**立即停下**，联系 Lovable 支持回滚，再回到本手册第 1 步。
- 本次连接走「普通 Supabase 客户端 + URL + anon key」，把共享库当外部 Supabase 用。

---

## 1. 环境变量

用 Lovable 的 env 工具写入 `.env`（VITE_ 前缀，前端可见）：

```env
VITE_SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<由用户从共享项目 Supabase Dashboard → Project Settings → API 复制 anon/publishable key 贴入>
VITE_SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz
```

同时 SSR 端需要同名无前缀变量（TanStack Start 服务端读 `process.env`）：

```env
SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co
SUPABASE_PUBLISHABLE_KEY=<同上 anon key>
SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz
```

> anon key 是公开可发布的 key，写进 `.env` 安全；**绝对不要**写 service_role key。

---

## 2. 在 First Steps 创建以下文件

### 2.1 `src/integrations/supabase/client.ts`

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://narqwgwpqglathwtyevz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // 不要改 storageKey，默认 sb-narqwgwpqglathwtyevz-auth-token 与共享库一致
  },
});
```

### 2.2 `src/integrations/supabase/types.ts`

从共享库项目原样复制（见 §7 同步流程）。首次落地由用户从共享项目复制全文贴入。

### 2.3 `src/integrations/supabase/auth-attacher.ts`

```ts
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      sendContext: {},
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
```

### 2.4 `src/integrations/supabase/auth-middleware.ts`（**不用 service_role**）

```ts
import { createMiddleware } from "@tanstack/react-start";
import { getHeaders } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const headers = getHeaders();
    const auth = headers["authorization"] ?? headers["Authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new Response("Unauthorized: No authorization header provided", { status: 401 });
    }
    const accessToken = auth.slice("Bearer ".length);

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
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
```

> 关键：服务端 client 也用 **anon key + 用户 bearer**，RLS 以用户身份生效。永远不引入 `client.server.ts` / service_role。

### 2.5 补丁 `src/start.ts`

把 `attachSupabaseAuth` **append** 到 `functionMiddleware`（不替换已有项）：

```ts
import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try { return await next(); }
  catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) throw error;
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
```

### 2.6 `src/routes/_authenticated/route.tsx`

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { from: location.href } });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
```

### 2.7 `src/routes/auth.tsx`

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ from: (s.from as string) ?? "/" }),
  component: AuthPage,
});

function AuthPage() {
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setErr(error.message);
    navigate({ to: from || "/" });
  }

  async function signInGoogle() {
    const { lovable } = await import("@/integrations/lovable");
    await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-8">
      <h1 className="text-2xl font-bold">登录</h1>
      <form onSubmit={signIn} className="space-y-2">
        <input className="w-full border p-2" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border p-2" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="w-full bg-black text-white p-2" type="submit">邮箱登录</button>
      </form>
      <button className="w-full border p-2" onClick={signInGoogle}>使用 Google 登录</button>
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </div>
  );
}
```

### 2.8 补丁 `src/routes/__root.tsx`

在 RootComponent 里加 `onAuthStateChange` 监听（仅身份切换事件）：

```tsx
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function RootComponent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  // ...existing JSX
}
```

---

## 3. 使用示例

### 3.1 读 `marketing_assets`

```ts
// src/api/assets.ts
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const assetsQueryOptions = (shopId: string | null) =>
  queryOptions({
    queryKey: ["marketing_assets", shopId],
    queryFn: async () => {
      let q = supabase.from("marketing_assets").select("*").order("created_at", { ascending: false });
      if (shopId) q = q.eq("shop_id", shopId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
```

```tsx
export const Route = createFileRoute("/_authenticated/assets")({
  loader: ({ context }) => context.queryClient.ensureQueryData(assetsQueryOptions(null)),
  component: () => {
    const { data } = useSuspenseQuery(assetsQueryOptions(null));
    return <AssetList items={data} />;
  },
});
```

### 3.2 写操作（服务端，RLS 以用户身份）

```ts
// src/lib/assets.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shop_id: z.string().uuid(), title: z.string(), kind: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("marketing_assets")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });
```

### 3.3 调 Edge Function

```ts
export const renderVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ job_id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.functions.invoke("render-marketing-video", { body: data });
    if (error) throw error;
    return out;
  });
```

### 3.4 Realtime

```ts
useEffect(() => {
  const channel = supabase
    .channel("marketing_video_jobs")
    .on("postgres_changes", { event: "*", schema: "public", table: "marketing_video_jobs" }, () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_video_jobs"] });
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

### 3.5 Storage 签名 URL

```ts
export const getAssetUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase.storage
      .from("marketing-assets")
      .createSignedUrl(data.path, 3600);
    if (error) throw error;
    return out.signedUrl;
  });
```

---

## 4. RLS 与多门店约束

- 所有面向门店的 insert **必须**带 `shop_id`，缺失会被 RLS 403。
- 查询尽量带 `.eq("shop_id", currentShopId)`，命中索引。
- 总部管理员判断：`select public.has_role(auth.uid(), 'admin')`。

```ts
// src/hooks/use-shops.ts
export const shopsQueryOptions = queryOptions({
  queryKey: ["shops"],
  queryFn: async () => {
    const { data, error } = await supabase.from("shops").select("*").eq("active", true);
    if (error) throw error;
    return data;
  },
});

// src/hooks/use-is-admin.ts
export const isAdminQueryOptions = queryOptions({
  queryKey: ["is_admin"],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (error) throw error;
    return Boolean(data);
  },
});
```

---

## 5. 登录态共享说明

- 共享库 URL = `https://narqwgwpqglathwtyevz.supabase.co` → localStorage key 自动是 `sb-narqwgwpqglathwtyevz-auth-token`，**不要改**。
- 同域名 → 登录态自动共享。
- 跨域名 → 用户需在 First Steps 重新登录一次，但 `auth.users.id` 是同一个，行级数据完全共享。

---

## 6. Mock 清理清单

**删除**：
- `src/api/client.ts`
- `src/mocks/data.ts`
- 整个 `src/mocks/` 目录

**改写为真实 Supabase 查询**：
- `src/api/{assets,accounts,publish,aigc,automation,shops}.ts`

**路由迁移到受保护布局**：把以下从 `src/routes/` 移到 `src/routes/_authenticated/`：
- `index.tsx`、`assets.tsx`、`aigc.tsx`、`publish.tsx`、`accounts.tsx`、`automation.tsx`、`settings.tsx`

**类型对齐**：`src/types/index.ts` 用 `Database["public"]["Tables"]["..."]["Row" | "Insert" | "Update"]` 替换。

---

## 7. `types.ts` 手动同步流程

共享库每次 migration 后：

1. 用户从共享库复制 `src/integrations/supabase/types.ts` 全文。
2. 用户在 First Steps 对话粘贴下面这段：

> 把下面这段完整覆盖 `src/integrations/supabase/types.ts`，然后跑 typecheck，按报错把 `src/api/*.ts` 的表名/字段名对齐：
>
> ```ts
> <粘贴新的 types.ts 全文>
> ```

3. First Steps Agent 覆盖 → typecheck → 修字段不匹配。

---

## 8. First Steps Agent 执行清单

1. **确认未启用** Lovable Cloud（若已启用立刻停止并报告用户）。
2. 写入 §1 的 6 个 env。
3. 创建 §2.1 / §2.3 / §2.4 / §2.6 / §2.7 五个新文件。
4. 让用户复制共享库 `types.ts` 全文贴入 §2.2 位置。
5. 应用 §2.5 / §2.8 两个补丁。
6. 按 §6 删除 mock、改写 6 个 api 文件、迁移 7 个路由文件。
7. 跑 typecheck，按报错对齐 `Database` 类型。
8. 启用 Google OAuth：调 `supabase--configure_social_auth` 选 google。
9. 手测：登录 → `/_authenticated/assets` → 看到真实数据 → 新建一条 asset 成功。

---

## 9. 暂缓项（本次不做）

- **Phase 2 总部表** (`headquarters_publish_batches` / `automation_tasks` / `hq_dashboard_metrics_v`)：接通后再回共享库出 migration。
- **Phase 3 Worker 回调路由 + `WORKER_SHARED_SECRET`**：等 Codex 反馈契约后在共享库生成，再让 First Steps `set_secret` 写入同名 secret。
- **服务端 service_role client**：本次不下发。

---

## 10. 故障排查

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| `Unauthorized: No authorization header provided` | `functionMiddleware` 未注册 / attacher 没拿到 session | 检查 §2.5；浏览器先登录 |
| `Expected 3 parts in JWT; got 1` | 误用 sb_secret_ 新格式 key | 确认 §1 用的是 `eyJ...` 开头的 JWT 格式 anon key |
| 查询返回空但 SQL 直查有数据 | RLS 命中失败（多半 `shop_id` 不可见） | 检查 `shops` 可见性策略 + insert `shop_id` 是否正确 |
| Realtime 不触发 | 共享库未在该表 enable replication | Supabase Dashboard → Database → Replication 打开该表 |
| 跨项目登录不共享 | 域名不同 | 预期行为；让用户重新登录一次 |

---

**手册结束。** First Steps Agent 按 §8 执行；任何步骤卡住，停下来回报具体报错。
