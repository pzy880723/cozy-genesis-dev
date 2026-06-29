# 接入 Worker 端到端闭环

## 思路

Worker 在腾讯云、由 Codex 维护，我（Cloud 端）只能保证「我这一侧按 `docs/WORKER_CONTRACT.md` 暴露的接口是对的」。所以这次拆成两块：

1. **Cloud 端我直接做**：实现 Worker 拉单 / 回调 / 自动化 cron 三个 HTTP 端点，让 Worker 一接上就能跑通。
2. **给 Codex 的清单**：把对接需要的 URL / Secret / Schema 整理成一份文档，你转给他。

如果 Codex 拍下来某些字段要调整，我再小步迭代。

---

## 一、Cloud 端要建/改的文件

### 新增

```text
src/lib/shared-admin.server.ts      共享库 service_role 客户端工厂（server-only）
src/lib/worker-hmac.server.ts       HMAC 校验 + Bearer 校验工具
src/routes/api/public/worker/cron-tick.ts    POST，Worker 主动拉单
src/routes/api/public/worker/callback.ts     POST，Worker 回写 target/account 状态
src/routes/api/public/cron/automation-tick.ts POST，由腾讯云定时器/pg_cron 每分钟打一次，按 run_times+daily_limit 创建 job
docs/WORKER_HANDOFF.md              给 Codex 的对接说明（URL/Secret/示例 payload/错误码）
```

### 修改

- `docs/migrations/2026-06-29-publish-center.sql`
  - `social_publish_jobs` 加一个 `automation_task_id uuid` 列（自动化任务回链，用于按天计数）
  - 加一个 trigger：每次 `social_publish_targets` 状态变化时，自动汇总写回 `social_publish_jobs.status`（success / partial_success / failed / running）
- `src/api/publish.ts`：`create` 接受可选的 `automationTaskId` 并写入新列
- `src/api/automation.ts`：`runNow` 改为通过 `publishApi.create` 时带上 `automationTaskId`
- `src/routes/_authenticated/publish.tsx`：详情抽屉显示 `last_step / progress / 平台 post URL`（这些字段已经在 DB，前面只是没渲染）

### 不动

- UI 视觉、其它页面、Worker 的实现都不动。

---

## 二、接口契约（与 WORKER_CONTRACT.md 对齐）

### 1. `POST /api/public/worker/cron-tick` —— Worker 主动拉单
- 鉴权：`Authorization: Bearer ${WORKER_SHARED_SECRET}`
- Body：`{ max_batch?: number=10, platforms?: string[], worker_id: string }`
- 行为：
  - 用 service_role 把最多 `max_batch` 个 `status='pending'` 的 target 置为 `claimed`，写入 `worker_task_id / claim_token / claim_expires_at = now()+15min`
  - 同时把对应 `social_publish_jobs.status` 升到 `running`（如果还是 queued）
  - 返回每个 target 的完整 payload：job 主文案/标签、平台、`per_platform` 覆盖、`account_id`+`worker_account_key`、素材 URL（直接传 `marketing_assets.output_url`，先不签名；签名 URL 留 Phase 2）
- 错误：401 / 400 / 500，统一 JSON
- Cloudflare Worker 运行时安全：所有 `process.env.*` 读取都放在 handler 内

### 2. `POST /api/public/worker/callback` —— Worker 回调
- 鉴权：HMAC，校验 `X-Worker-Timestamp`（±5min）+ `X-Worker-Signature = hex(hmac_sha256(secret, ts + "." + raw_body))`，timing-safe 比较
- 支持 7 类事件（按 WORKER_CONTRACT §3）：
  - `target.progress` → 仅 update `progress + last_step`
  - `target.success` → `status=success` + `platform_post_id/url` + `finished_at`
  - `target.failed` → 若 `retry_after_seconds` 给了且 `retry_count<3`：回 `pending` + retry_count+1；否则 `failed`
  - `target.cancelled` → `status=cancelled`
  - `account.bound / account.cookie_expired / account.checked` → 更新 `social_accounts.cookie_status` 等字段
  - `login.scan_consumed` / `log` → 先记日志，不做实际动作
- 任何 target 写完后再触一次 job 汇总（trigger 兜底，handler 也算一遍）

### 3. `POST /api/public/cron/automation-tick` —— 内部 cron
- 鉴权：Bearer `WORKER_SHARED_SECRET`（同一份，方便 Codex 复用，也防匿名调用）
- 调度方：腾讯云定时函数 / pg_cron / 任意 1 分钟级 scheduler，由你或 Codex 配置一次即可
- 行为：
  - 拉 `automation_tasks where status='enabled'`
  - 对每个 task：当前 `HH:MM` 命中 `run_times` 中任一项的 ±2 分钟窗口
  - 检查今日已生成 job 数（按 `automation_task_id + created_at >= today`），未达 `daily_limit` 才生成
  - 调 `publishApi.create({ automationTaskId, ... })` 创建 job + targets，状态进 `queued/pending`，Worker 下一轮 cron-tick 自然领走
  - 更新 `last_run_at / next_run_at`；失败按 `failure_policy` 处理（retry_once / pause / notify→只记 error）

---

## 三、密钥

| 名称 | 用途 | 当前状态 |
|---|---|---|
| `WORKER_SHARED_SECRET` | 三个端点的 Bearer + HMAC | ✅ 已生成（你点过了） |
| `SHARED_SUPABASE_SERVICE_ROLE_KEY` | callback / cron-tick 写共享库（RLS=authenticated，匿名进不去） | ⏳ 需要你从共享库 Supabase Dashboard → API → service_role 复制 |

第二个我会在切到 build 模式之后弹 add_secret 表单。

---

## 四、给 Codex 的对接清单（我会生成 docs/WORKER_HANDOFF.md）

> Codex 看这一份就够，不用读 WORKER_CONTRACT 全文。

1. **三个 URL**（部署后 stable host：`project--3a5a8bad-dfde-4d66-8cd6-9786e7370c8e.lovable.app`）
   - 拉单：`POST https://{host}/api/public/worker/cron-tick`
   - 回调：`POST https://{host}/api/public/worker/callback`
   - 自动化 tick（如果 Worker 想代为触发）：`POST https://{host}/api/public/cron/automation-tick`
2. **共享密钥**：`WORKER_SHARED_SECRET`，请你（用户）通过安全渠道发给 Codex
3. **HMAC 算法**：`hex(hmac_sha256(secret, ts_unix_seconds + "." + raw_request_body))`
4. **建议轮询频率**：cron-tick 每 15–30 秒一次；`claim_expires_at` 默认 15 分钟，超过未回报会重新进入 `pending`
5. **回调 payload schema**：列出 7 类事件 + 必填字段 + 错误码字典
6. **素材**：先直接 GET `marketing_assets.output_url`（Supabase Storage 公开 URL），Phase 2 改签名 URL
7. **Codex 需要回我的问题**（写在文档末尾）：
   - Worker 出口 IP 列表（若 Supabase 要白名单）？
   - `social_accounts.worker_account_id` / `worker_account_key` 是否保留？还是只用 Cloud 主键 uuid？
   - 真实跑通的平台/内容类型分别是什么阶段？

---

## 五、验收脚本

切到 build 之后我会跑：

1. 手动发布一个 job → 库里 `jobs.status=queued`、`targets.status=pending`
2. `curl -H "Authorization: Bearer $SECRET" .../cron-tick -d '{"worker_id":"test","max_batch":5}'` → 返回 target 列表 + 库里 `pending→claimed`
3. `curl` 一个带 HMAC 的 `target.success` → 库里 `target.status=success`、`job.status=success`
4. 创建一个 `automation_tasks(daily_limit=2, run_times=[当前分钟])`，打一次 `automation-tick` → 库里多出一条 `social_publish_jobs(automation_task_id=...)`
5. 前端「发布中 / 发布记录 / 自动化任务」三个 tab 5 秒内能看到状态翻转

## 范围之外（这次先不做）

- Cloud→Worker 的反向推送（cancel / retry / account login QR）——等 Codex 给 Worker 出口 URL 后再加
- 签名 URL（素材 URL 现在直传公开链接）
- `worker_logs` 表
- 视觉/UX 改动
