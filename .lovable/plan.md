## 目标

把「发布中心」从 mock 切到共享 Supabase 真库（项目 ref `narqwgwpqglathwtyevz`），手动发布 + 自动化任务 + 任务详情/重试/取消全部跑通。Worker 还没接，所以「执行」这一步只把任务写入 `social_publish_jobs / social_publish_targets`（status=`queued`，等 Worker 拉），UI 上能看到状态机和数据流。

## 范围（一次做完）

1. 手动发布向导提交后真的入库
2. 「发布中 / 发布记录」从真库读 + 5 秒轮询刷新
3. 任务详情侧栏（点「查看详情」打开，按平台展示 target、重试单个 target、取消整任务）
4. 自动化任务 CRUD（需要先在共享库加 `automation_tasks` 表）
5. 账号选择真库 `social_accounts`，按平台 + 范围筛选

## 前置：共享库 migration（用户在 Genie 那边执行）

本项目不能调 `supabase--enable`，也碰不到共享 Supabase。下面这段 SQL 我会原样放在 `docs/migrations/2026-06-29-publish-center.sql`，请粘到共享库（narqwgwpqglathwtyevz）执行后再同步 `types.ts`。

```sql
-- 1. automation_tasks
CREATE TABLE public.automation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('hq','store','multi_store')),
  shop_ids uuid[] NOT NULL DEFAULT '{}',
  content_kind text NOT NULL DEFAULT 'image_text',
  asset_source text NOT NULL DEFAULT 'mixed',
  content_strategy text,
  platforms text[] NOT NULL DEFAULT '{xhs,wechat_channels,douyin,kuaishou}',
  daily_limit int NOT NULL DEFAULT 1,
  run_times text[] NOT NULL DEFAULT '{10:00}',
  failure_policy text NOT NULL DEFAULT 'retry_once',
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','paused','error')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_tasks TO authenticated;
GRANT ALL ON public.automation_tasks TO service_role;

ALTER TABLE public.automation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read" ON public.automation_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write" ON public.automation_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. 给 social_publish_targets 补 Phase 2 列（契约 §1.2）
ALTER TABLE public.social_publish_targets
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
```

执行完用户把更新的 `types.ts` 粘回来覆盖 `src/integrations/shared-db/types.ts`，我再做后续对齐。

## 代码改动

### `src/api/publish.ts`（重写）

- `list({status?, limit?})`：`social_publish_jobs` join `social_publish_targets`（按 `created_at desc`），再 join `social_accounts(account_name, platform)`；映射成 `PublishJob`。
- `create(input)`：
    1. `social_publish_jobs.insert({ shop_id: input.shopIds[0] || 'hq', kind: input.contentType, title, body, tags, images, schedule_at, status:'queued' })` 拿 `jobId`。
    2. 按 `platforms × shopIds` 选账号：查 `social_accounts where shop_id in (..) and platform in (..) and cookie_status='valid'`，每对 (platform, shop) 取第一条；缺账号的 (platform, shop) 收集成 `missing[]` 返回给前端提示。
    3. 拿到的账号批量 `social_publish_targets.insert({ job_id, account_id, platform, status:'pending' })`。
- `cancel(jobId)`：`update social_publish_jobs.status='cancelled'` + 把 `targets` 里非 success/failed 的全部置 `cancelled`。
- `retryTarget(targetId)`：把单个 target 置 `pending`、`retry_count = retry_count + 1`、清 error。
- `detail(jobId)`：单任务 + 全部 targets + 账号信息。

### `src/api/accounts.ts`

- `list({shopIds?, platforms?})` 改读 `social_accounts`，映射 `cookie_status` → UI `status`。
- 用于向导第 2 步显示「该范围 × 平台 可用账号 N 个，缺：xhs/南京店」。

### `src/api/automation.ts`（重写）

- `list({status?})` 从 `automation_tasks` 读，映射成 `AutomationTask`。
- `create(input)` 直接 insert；`update(id, patch)` 包含 `status='paused'/'enabled'`。
- `runNow(id)`：目前没 Worker，先按任务策略合成一条 `social_publish_jobs`（pick 一条最新可用素材 + 一份默认文案），并 `update automation_tasks set last_run_at=now()`。Worker 接入后这步替换成"派单"。

### `src/types/index.ts`

`PublishJob.status` 增加 `pending` 等真库枚举的映射；`PublishTarget.status` 同步。

### `src/routes/_authenticated/publish.tsx`

- `JobList`：useQuery 加 `refetchInterval: 5000`；空状态 + loading skeleton。每行「查看详情」打开右侧 Drawer。
- 新增 `JobDetailDrawer`：
    - 顶部任务标题、状态、计划时间。
    - Targets 表格：账号名 / 平台 Badge / 状态 / 进度（progress + last_step）/ 错误。
    - 操作：失败 target 显示「重试」；非终态任务显示「取消整个任务」。
    - 操作后调用 mutation + `invalidateQueries(['publish-jobs'])`。
- `Wizard` 提交时：成功后 toast 显示「已创建，N 个目标已排队，缺账号：…」并跳到「发布中」tab；失败显示错误。
- 第 2 步选范围 + 平台后，实时调用 `accountsApi.list` 显示「将发布到 X 个账号」的预览。
- 自动化抽屉收齐字段（scope_type/shop_ids/content_kind/asset_source/daily_limit/run_times/failure_policy），提交后真入库；保存后列表用 react-query 刷新而不是手工 setQueryData。

### `src/mocks/data.ts` 与 `src/api/client.ts`

继续保留（assets / aigc 还在用），不删，只是 publish / accounts / automation 不再从这里读。

## 验收脚本

1. 登录 → /publish?mode=manual → 选 1 张素材、范围=总部 + 平台全选 → 生成文案 → 创建任务 → toast 提示。
2. 切到「发布中」：看到刚刚的任务，5 秒后仍在；点详情，看到 4 个 target，状态 pending。
3. 详情里点「取消整个任务」→ 状态变 cancelled，targets 全部 cancelled。
4. 自动化 tab：新建任务，刷新页面后仍在；暂停/启用切换持久；点「立即执行」→ 「发布中」多一条新任务。
5. 用 psql 校验：`select count(*) from social_publish_jobs where created_by = auth.uid();` 与 UI 一致。

## 不在本次范围

- Worker 真实派单 / HMAC 回调路由（等 Codex 那边对齐）
- 视频上传、封面生成、定时调度 cron
- 账号扫码登录的真实流程（继续用现有占位）
- UI 全站视觉改版（你说过先放下）

## 风险与回退

- 共享库 migration 没跑：`automation_tasks` 表不存在，自动化 tab 报错。降级方案：检测到 PostgREST `42P01` 时，前端继续显示 mock + 顶部红条提示「未执行 migration」。
- `social_accounts` 没有 valid 账号：创建任务会全平台缺账号，向导第 4 步禁用「创建」按钮并提示去「账号中心」绑定。
