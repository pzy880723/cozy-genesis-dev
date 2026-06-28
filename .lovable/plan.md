# BOOMER.OFF PC 端：与 Genie 营销中心打通

## 总原则

- PC 端和 Genie 手机端共享 **同一个 Supabase 项目**（ref `bef32724-503e-467a-af03-2062176cf921`）：同库、同 RLS、同 Edge Functions、同 Storage、同提示词。
- PC 端只换一层 UI，并补充总部独有的「跨门店调度/大盘/批量自动化」能力。
- Codex 重写 Worker 部分（小红书 / 视频号 / 抖音 / 快手 的实际投递与扫码登录），按下方新契约对接。
- 第一版页面范围：素材库、AI 创作（图/文/视频）、发布 Workbench（含批量）、账号管理、发布历史 + JobDetail、运营大盘。其余 Genie 页面（活动、券、社区、班表）暂不进 PC。

---

## Phase 0 — 接入 Genie 数据库（需要你/用户操作一次）

1. 在 Lovable 编辑器里：**Connect → Supabase → 选择已有项目 `Genie Lamp Descriptions`**。不要走 `supabase--enable`（那会新建一个空库）。
2. 接入成功后 Lovable 会自动注入 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`，并生成 `src/integrations/supabase/{client.ts,client.server.ts,types.ts,auth-middleware.ts}`。
3. 我会立刻删除 `src/api/client.ts` 的 `mock()`、清掉 `src/mocks/`，把 `src/api/*.ts` 全部换成针对真实表的查询。

## Phase 1 — PC UI 重构（我负责，纯前端）

按 Genie 现有库表对齐路由与组件：

| PC 路由 | 数据来源 | 复用的 Edge Function |
|---|---|---|
| `/` 工作台 | `social_publish_jobs/targets` + `social_accounts` 聚合 | — |
| `/assets` 素材库 | `marketing_assets`(+characters/character_assets) | `analyze-marketing-assets`、`auto-tag-marketing-asset`、`describe-marketing-images` |
| `/aigc/copy` 文案 | `marketing_assets(kind=copy)` | `generate-marketing-copy`、`generate-share-copy` |
| `/aigc/image` AI 图 | `marketing_assets(kind=image)` | `ai-smart-ad-images`、`beautify-image`、`web-search-images` |
| `/aigc/video` 视频 | `marketing_video_jobs` | `generate-marketing-video-script`、`storyboard-marketing-video`、`render-marketing-video`、`poll-marketing-video` |
| `/publish` Workbench + 4 步向导 | `social_publish_jobs`、`social_platform_specs` | `dispatch-job-create`（**新契约**） |
| `/publish/history` + `/publish/jobs/:id` | `social_publish_jobs/targets` | `dispatch-job-status/cancel/retry` |
| `/accounts` 账号管理 | `social_accounts` | `dispatch-account-list/login/revoke` |
| `/automation` 自动化任务 | 新增表（见 Phase 2） | `dispatch-cron-tick` |
| `/settings` | `shops`、`shop_marketing_profiles`、`app_roles` | — |

UI 组件 (`AppShell` / `PageHeader` / `StatusBadge` / `PlatformBadge` / `MetricCard`) 已就位，沿用品牌红 `#E60012` 主题。

## Phase 2 — 总部独有能力（需要在 Genie 库里加表，我出 migration）

Genie 是单门店视角，PC 需要总部跨门店：
- 新建 `headquarters_publish_batches`（一次创建跨多门店多账号的发布批次，逻辑上是 `social_publish_jobs` 的 parent）。
- 新建 `automation_tasks`（cron 表达式 + 内容策略 + 平台 + 每日额度 + 范围 shop_ids[]），配合 `dispatch-cron-tick`。
- 新建 `hq_dashboard_metrics_v` 视图（聚合发布成功率、AI 用量、账号健康度）。

所有新表都满足 grants + RLS（按 `has_role(auth.uid(),'hq_admin')` 区分总部/门店）。

## Phase 3 — Worker 新契约（我出文档 → 给 Codex）

需要你转述给 Codex 的设计。当前 Genie 的 `dispatch-*` 函数偏向「单任务单账号」，PC 批量场景下不够，新契约要求：

### 3.1 队列模型
- `social_publish_jobs.status`: `draft → queued → running → partial_success | success | failed | cancelled`。
- `social_publish_targets.status`: `pending → uploading → publishing → success | failed | cancelled`，新增 `progress 0-100`、`last_step` 文本。
- Worker 通过 `dispatch-cron-tick`（Cloud 端 cron 拉起，每 30s）领取一批 `pending` target，**乐观锁更新** `worker_task_id`+`started_at`。

### 3.2 Worker → Cloud 回调
- 新建公共路由 `POST /api/public/worker/callback`（Lovable 端，HMAC 签名 + `WORKER_SHARED_SECRET`）：
  - `event`: `target.progress | target.success | target.failed | account.cookie_expired | account.bound`
  - payload 字段：`target_id`、`progress`、`last_step`、`error_message`、`platform_post_id/url`
- 回调里走 `supabaseAdmin` 写 `social_publish_targets` + 触发 trigger 滚动汇总 `social_publish_jobs.status`。

### 3.3 账号绑定（扫码）
- PC 调 `dispatch-account-login` → Edge 函数找 Worker 申请二维码 → Worker 回 `{login_session_id, qrcode_png_base64, expires_at}` → Edge 写 `social_accounts(cookie_status='pending')` 并把 base64 透传给前端。
- Worker 扫码成功后回 `/api/public/worker/callback` 带 `event=account.bound`，更新 `worker_account_key` + `cookie_status='valid'` + `account_name/avatar_url/capabilities`。
- 每小时一个 cron 跑 `dispatch-account-list` 健康检查；失效 → `cookie_status='expired'` + 大盘提醒。

### 3.4 文件交付
- 素材统一走 Supabase Storage bucket `marketing-assets`（已存在），生成签名 URL 传给 Worker；Worker 下载后投递。**Worker 自己不直接访问 Supabase**，只走 HTTPS 签名链接。

### 3.5 平台能力清单
- 由 `social_platform_specs` 表驱动 PC 端校验（图片张数/视频时长/标题长度），Worker 投递前再次校验，两边读同一张表。

我会把上述 3.1–3.5 整理成一份单独的 `WORKER_CONTRACT.md` 写到本项目仓库 `docs/`，由你直接转交 Codex，他只需要实现 Worker 侧的 cron 拉取 + 回调发送，不需要碰 Lovable 代码。

---

## 技术细节

- Stack：TanStack Start，认证页放 `/auth`，全部业务路由放 `_authenticated/` 下，靠模板自带网关守护。
- 数据读取统一 `useSuspenseQuery + queryOptions`，列表分页用 `loaderDeps`。
- 服务端写操作（创建发布任务、调用 Edge Function）走 `createServerFn` + `requireSupabaseAuth`，再 fetch Genie 已部署的 Edge Function（`supabase.functions.invoke(...)`）。
- Worker 回调路由 `/api/public/worker/callback`，HMAC + timing-safe 比较；密钥用 `secrets--generate_secret WORKER_SHARED_SECRET`，同时让 Codex 在 Worker 侧用同一份。
- 不动 Genie 的 Edge Function 实现，只增量：可能新增 `hq-publish-batch-create`、`hq-automation-tick` 两个云函数（待 Phase 2 决定）。

---

## 我向 Codex 的第一批问题（请你转述）

1. 现有 Worker 是部署在哪里（Cloudflare Worker / 自托管 Node / 别的）？需要我们提供回调 URL，可达性？
2. Worker 当前用 `worker_account_id`(int) + `worker_account_key`(text) 标识账号，新契约保留这两个字段还是要换成单一 UUID？
3. 扫码绑定阶段 Worker 能输出 base64 PNG 二维码吗？还是返回一个 URL 让前端轮询？
4. 平台投递的实际能力（小红书图文/视频、视频号、抖音、快手）目前哪些跑通了？哪些还是 mock？
5. Worker 端是否能接受签名 URL 下载素材（不直接连 Supabase Storage）？

---

## 执行顺序

1. **你**：在编辑器里把当前项目 Connect 到 Genie 那个 Supabase。
2. **我**：删 mock 层、生成 `WORKER_CONTRACT.md`、重构 7 个页面接真实表，写 Phase 2 migration。
3. **你 → Codex**：转 WORKER_CONTRACT + 上面 5 个问题，等他回。
4. **我**：根据 Codex 反馈微调 Edge Function 调用 + 公共回调路由。
5. 联调通了之后再考虑 Phase 2 的总部独有 migration 上线。
