# 把本项目（First Steps）接入共享 Supabase 库 `narqwgwpqglathwtyevz`

我搞反了方向。这个项目就是 First Steps，上一轮粘进来的手册是让**我在这里照着落地**的，不是让我去写给别人看。重新规划，直接动手。

## 边界确认

- **不**调用 `supabase--enable`（避免开新的独立库）。
- **不**下发 service_role，所有写操作走 RLS + 用户 JWT。
- types.ts 手动同步，本次首版需要您从共享库复制全文给我。

## 我现在不能独立完成的两件事，需要您配合

1. **anon / publishable key**：必须从共享库 Supabase Dashboard → Project Settings → API 复制 `anon public` key 给我，我用 `set_secret` 写入 `VITE_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_PUBLISHABLE_KEY`（VITE_ 前缀的也得走 secret 接口才能被前端读到）。
2. **types.ts 首版**：从共享库 `src/integrations/supabase/types.ts` 整段粘给我，我覆盖落地。

> 在拿到这两样之前，我先把不依赖它们的部分全部落地（client / 中间件 / 路由壳 / mock 清理）。types 未到位时 `Database` 类型用 `any` 占位临时编译过，等您贴 types 再一次替换。

## 执行步骤（一次性把能做的全做了）

### Step 1 — 写环境变量（占位 anon key，等您给）

- `set_secret` 写入：
  - `VITE_SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co`
  - `SUPABASE_URL=https://narqwgwpqglathwtyevz.supabase.co`
  - `VITE_SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz`
  - `SUPABASE_PROJECT_ID=narqwgwpqglathwtyevz`
- `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`：**等您给值后再 set**。

### Step 2 — 新建 Supabase 集成文件

- `src/integrations/supabase/client.ts`（浏览器端，默认 storageKey）
- `src/integrations/supabase/types.ts`（**先放最小占位** `export type Database = any;`，等您贴真的覆盖）
- `src/integrations/supabase/auth-attacher.ts`（client functionMiddleware，挂 bearer）
- `src/integrations/supabase/auth-middleware.ts`（`requireSupabaseAuth`，anon key + 用户 bearer，**不用 service_role**）

### Step 3 — 改 `src/start.ts`

把 `attachSupabaseAuth` append 到 `functionMiddleware`，保留原 `errorMiddleware`。

### Step 4 — 路由壳：登录 + 受保护布局

- 新建 `src/routes/auth.tsx`（公共登录页：邮箱密码 + Google via lovable broker）
- 新建 `src/routes/_authenticated/route.tsx`（`ssr: false` + `supabase.auth.getUser()` 守门）
- 把现有业务路由从 `src/routes/` 移到 `src/routes/_authenticated/`：`index.tsx` / `assets.tsx` / `aigc.tsx` / `publish.tsx` / `accounts.tsx` / `automation.tsx` / `settings.tsx`
- 在 `__root.tsx` 的 RootComponent 里加 `onAuthStateChange` 监听（仅 SIGNED_IN/OUT/USER_UPDATED）

### Step 5 — 清 mock（**但不破坏 UI**）

`src/api/*.ts` 目前每个文件都 `import { mock } from "./client"` 喂 `src/mocks/data.ts`。粗暴删 mock 会让所有页面白屏。本次策略：
- **删除** `src/api/client.ts` 和 `src/mocks/data.ts`。
- 把 `src/api/{shops,assets,accounts,publish,aigc,automation}.ts` 改成真实 Supabase 查询的骨架：
  - 读：`supabase.from("...").select(...)` 直接返回。
  - 列表写：暂时 `throw new Error("尚未对齐 schema，待 types.ts 同步后实现")`，让点击写按钮报清楚的错而不是白屏。
- 等 types.ts 到位后，再做第二轮：按真实字段补全 insert / update / delete + `createServerFn` 服务端写。

### Step 6 — typecheck + 启动验证

- 跑 typecheck，按报错修。
- 让您在浏览器打开 `/auth` 登录（需要您先给 anon key），看 `/_authenticated/` 路由能否进。

## 暂缓项（与原方案一致）

- Phase 2 总部表
- Phase 3 Worker 回调路由 + `WORKER_SHARED_SECRET`
- 服务端 service_role client
- API 写操作的完整实现（等 types）

## 您需要在审批本方案前/后告诉我的

A. 共享库的 **anon public key**（`eyJ...` 开头那串），我用 `set_secret` 存。
B. 共享库 `src/integrations/supabase/types.ts` 的**全文**。

如果两样都还没准备好，我也可以**先执行 Step 2-5 的占位版本**（types=any、写操作抛错），先把骨架搭出来；您拿到 anon key 和 types 后我再一次性补齐。

---

确认后我进 build 模式动手。如果您想"两样都等齐了再开工"，我就先停在这里。
