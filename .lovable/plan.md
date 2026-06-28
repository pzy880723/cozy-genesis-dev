# PC 端（First Steps）接入本项目 Lovable Cloud 数据库 — 接入手册

## 目标

只在**本项目**新建一份手册 `docs/cross-project-shared-db.md`，您把它粘贴到 First Steps 那边的 Lovable 对话，对方 Agent 零思考即可落地。**本次不动任何运行代码，不动数据库。**

按您的选择：
- **浏览器端 client 唯一**（不下发 service_role）
- **Phase 2 总部表先不动**
- **types.ts 手动复制**

## 手册大纲（`docs/cross-project-shared-db.md`）

### 0. 前置警告

- First Steps 绝对不要点 "Enable Lovable Cloud"，否则会被开一个新的独立库。
- 如果已经误开，先停下来联系 Lovable 支持回滚，再继续。
- 本次只用「普通 Supabase 客户端 + URL + anon key」连本项目。

### 1. 连接参数（可直接贴）

```env
VITE_SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<本项目 anon/publishable key>
VITE_SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz
```

anon key 我会用 `secrets--fetch_secrets` + 读本项目环境拿到真实值贴进文档。所有写权限由 RLS + Edge Function 控制，不下发 service_role。

### 2. 要在 First Steps 创建的文件（完整代码）

- `src/integrations/supabase/client.ts` — 浏览器端 client，`persistSession: true` + `autoRefreshToken: true`，localStorage key 自动复用 `sb-narqwgwpqglathwtyevz-auth-token`。
- `src/integrations/supabase/types.ts` — 从本项目原样复制（手册附「同步指令」）。
- `src/integrations/supabase/auth-attacher.ts` — TanStack functionMiddleware，给 createServerFn 调用挂 bearer。
- `src/integrations/supabase/auth-middleware.ts` — `requireSupabaseAuth`，用 anon key + 用户 bearer，**不引入 service_role**；服务端写也走用户身份，RLS 生效。
- `src/start.ts` 补丁 — 把 `attachSupabaseAuth` append 到 `functionMiddleware`。
- `src/routes/_authenticated/route.tsx` — 受保护布局（`ssr: false` + `supabase.auth.getUser()` 守门）。
- `src/routes/auth.tsx` — 公共登录页（邮箱 + Google，Google 走 `lovable.auth.signInWithOAuth`）。
- `src/routes/__root.tsx` 补丁 — 注册 `onAuthStateChange` 仅监听身份切换事件。

### 3. 使用示例（贴即用）

- 读 `marketing_assets`：`queryOptions` + `useSuspenseQuery`，loader 用 `ensureQueryData`。
- 写操作：`createServerFn` + `requireSupabaseAuth` + `context.supabase.from('marketing_assets').insert({ shop_id, ... })`。
- 调 Edge Function：`createServerFn` 内 `context.supabase.functions.invoke('render-marketing-video', { body })`。
- Realtime：浏览器端 `supabase.channel('marketing_video_jobs').on('postgres_changes', ...)`。
- Storage 签名 URL：`createServerFn` 内 `context.supabase.storage.from('marketing-assets').createSignedUrl(path, 3600)`。

### 4. RLS 与多门店约束

- 所有面向门店的 insert 必须带 `shop_id`，给一个 `useShops()` hook 示例（查 `shops` + 当前用户可见门店）。
- 总部管理员：`public.has_role(auth.uid(), 'admin')`，前端用一个 `useIsAdmin()` hook。
- 列出常踩坑：insert 没带 `shop_id` → RLS 403；查询要带 `.eq('shop_id', ...)` 才能命中索引。

### 5. 登录态共享

- 同 Supabase URL ⇒ localStorage key 一致，**同域**自动共享；跨域名要重新登录，但 `auth.users.id` 同一份，数据共享无碍。
- 不要在 First Steps 改 storageKey，保持默认。

### 6. Mock 清理清单

明确列出 First Steps 这些文件要怎么处理：
- 删：`src/api/client.ts`（mock 层）、`src/mocks/data.ts`、整个 `src/mocks/`。
- 改写为真实查询：`src/api/{assets,accounts,publish,aigc,automation,shops}.ts`。
- 路由文件 `_authenticated/` 化：把 `src/routes/{index,assets,aigc,publish,accounts,automation,settings}.tsx` 移到 `src/routes/_authenticated/` 下。
- `src/types/index.ts` 保留，但用 `Database['public']['Tables']['...']['Row']` 重新对齐。

### 7. types.ts 手动同步流程

- 每次本项目跑 migration 后：本项目里读 `src/integrations/supabase/types.ts` → 完整覆盖 First Steps 同名文件 → 重新 typecheck。
- 手册给一条"提示语模板"，您可以直接把新 types.ts 内容连同这段提示丢给 First Steps Agent。

### 8. 落地步骤（给 First Steps Agent 的执行清单）

1. 确认未启用 Lovable Cloud。
2. 用 Lovable 工具写 `.env`（VITE_* 三个）。
3. 创建第 2 节里的 6 个文件 + 2 个补丁。
4. 删 mock、改写 6 个 api 文件。
5. 把业务路由移入 `_authenticated/`。
6. 跑 typecheck，按报错对齐 `Database` 类型。
7. 启用 Google OAuth：调 `supabase--configure_social_auth`（在 First Steps 项目内）。

### 9. 暂缓项（本次不做，留接口）

- Phase 2 总部表（`headquarters_publish_batches` / `automation_tasks` / `hq_dashboard_metrics_v`）：等接通验证后再回本项目出 migration。
- Phase 3 Worker 回调路由 + `WORKER_SHARED_SECRET`：等 Codex 反馈契约后再生成。
- 服务端 service_role client：本次不开放。

## 技术细节

- 文档语言：中文，配可直接复制的代码块。
- 代码风格对齐 TanStack Start 模板：`createServerFn` + `useServerFn` + `useSuspenseQuery + queryOptions`；公共路由禁止调受保护 server fn。
- `auth-middleware.ts` 用 anon key 构造服务端 client，再 `setSession({ access_token, refresh_token })`，RLS 以用户身份生效；不引入 `client.server.ts`。
- 不在文档里写 service_role 值；anon key 是公开 key，写在文档里合规。

## 本次只动这一个文件

`docs/cross-project-shared-db.md`（新建）。其它一律不动。

确认后我进入 build 模式开始写。
