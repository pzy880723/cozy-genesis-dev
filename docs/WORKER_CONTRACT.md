# Worker ↔ Cloud 契约（v1 草案）

> 适用范围：BOOMER.OFF PC 端（Lovable / TanStack Start）+ Genie 手机端共享同一个
> Supabase 项目 `bef32724-503e-467a-af03-2062176cf921`。Worker 由 Codex 实现，负责
> 真实小红书 / 视频号 / 抖音 / 快手 的扫码登录与内容投递。
>
> 本文档是「Cloud（Edge Function + 公共回调路由）<-> Worker」的接口规范。
> Worker 不直接连 Supabase，所有读写都经过 Edge Function 或公共回调路由。

---

## 0. 安全

- 共享密钥 `WORKER_SHARED_SECRET`（32+ 字节随机，Cloud 用 `secrets.generate_secret` 生成，Codex 在 Worker 侧配置同一份）。
- 所有 Worker 主动发起的回调请求 **必须** 在 HTTP 头里带：
    - `X-Worker-Timestamp`: Unix 秒
    - `X-Worker-Signature`: `hex(hmac_sha256(secret, timestamp + "." + raw_body))`
- Cloud 校验：时间戳偏差 ≤ 5 分钟 + timing-safe 比较签名。任何不通过的请求 401。
- Cloud → Worker 调用（仅在 `dispatch-job-create` / `dispatch-account-login` 中）：
  Edge Function 用 `Authorization: Bearer ${WORKER_SHARED_SECRET}` 即可。

---

## 1. 队列模型（表结构）

### 1.1 `social_publish_jobs`（已存在）

| 字段 | 含义 |
|---|---|
| `id` uuid PK | 任务 id |
| `shop_id` uuid | 所属门店（PC 端总部任务用「总部门店」占位） |
| `kind` text | `image_text` / `video` / `copy_only` |
| `title` / `body` / `tags[]` | 主文案与标签 |
| `images[]` / `cover_url` / `media_url` | 素材；URL 全部是 Supabase Storage 签名链接 |
| `per_platform` jsonb | 各平台覆盖（标题、文案、标签裁剪结果） |
| `schedule_at` timestamptz | 计划发布时间，NULL = 立即 |
| `status` text | `draft` → `queued` → `running` → `success / partial_success / failed / cancelled` |
| `retry_count` int | 总重试次数 |
| `worker_file_path` text | （可选）Worker 端缓存的本地路径，便于排错 |

### 1.2 `social_publish_targets`（已存在，需要新增列）

一个 job 拆成 N 个 target（每个账号一行）。

| 字段 | 含义 |
|---|---|
| `id` uuid PK | target id |
| `job_id` uuid FK | 父任务 |
| `account_id` uuid FK | `social_accounts.id` |
| `platform` text | `xhs` / `wechat_channels` / `douyin` / `kuaishou` |
| `status` text | `pending` → `claimed` → `uploading` → `publishing` → `success / failed / cancelled` |
| `progress` int (0–100) | 进度条 |
| `last_step` text | 人类可读的最近一步，例如「上传第 3/9 张图」 |
| `worker_task_id` text | Worker 端任务 id（领取时写入） |
| `started_at` / `finished_at` / `last_retry_at` | 时间戳 |
| `platform_post_id` / `platform_post_url` | 投递成功后回填 |
| `error_message` text | 失败原因（脱敏后展示给运营） |
| `retry_count` int | 单 target 重试次数 |

**Phase 2 新增列（需要的话）**：
- `claim_token` uuid：领取批次的唯一 token，用于乐观锁回写校验。
- `claim_expires_at` timestamptz：领取后若未在期限内回报，重新进入 pending。

### 1.3 `social_accounts`（已存在）

保留 `worker_account_id`(int) + `worker_account_key`(text)，作为 Worker 内部账号引用；Cloud 始终用 `social_accounts.id`(uuid) 作为对外主键。

---

## 2. Cloud → Worker（出站）

Cloud 提供 4 个 Edge Function（已存在的 `dispatch-*`，按新契约调整 body）：

### 2.1 `dispatch-job-create`
创建发布任务后，**不再** 一次性把 job 推给 Worker；只是把 `social_publish_jobs` + 拆好的 N 个 `social_publish_targets(status=pending)` 写入数据库，并触发一次 `dispatch-cron-tick` 让 Worker 立刻来领。

### 2.2 `dispatch-cron-tick`（**Worker 主动拉取**）
- HTTP `POST {edge}/functions/v1/dispatch-cron-tick`
- 鉴权：Bearer `WORKER_SHARED_SECRET`
- 入参：`{ "max_batch": 10, "platforms": ["xhs","douyin",...], "worker_id": "worker-cn-1" }`
- 行为：用 `FOR UPDATE SKIP LOCKED` 领取最多 `max_batch` 个 `pending` target，置为 `claimed` 并写入 `worker_task_id`/`claim_token`/`claim_expires_at(=now()+15min)`。
- 返回：领取到的 target 详情数组（含 job 主文案、平台、账号引用、签名链接的 images/cover/media_url、per_platform 覆盖）。
- Worker 应当每 15–30 秒调用一次；Cloud 端也跑一个每 30 秒的 cron 作为兜底。

### 2.3 `dispatch-account-login`
- HTTP `POST {edge}/functions/v1/dispatch-account-login`
- 入参：`{ shop_id, platform }`
- Edge 写 `social_accounts(cookie_status='pending')` 并调用 Worker `POST {worker}/login/start`，返回：
    ```json
    {
      "account_id": "uuid",
      "login_session_id": "string",
      "qrcode": "data:image/png;base64,...",
      "expires_at": "ISO8601"
    }
    ```
- 前端轮询 `social_accounts.cookie_status` 直到 `valid` 或 `expired`。

### 2.4 `dispatch-account-revoke` / `dispatch-job-cancel` / `dispatch-job-retry`
- 都是 Cloud → Worker 的单条命令：`POST {worker}/control` body `{ action, target_id|account_id }`。
- Worker 收到 cancel 后应停止上传 / 关闭浏览器实例，并在回调里把 `status='cancelled'`。

---

## 3. Worker → Cloud（入站，HMAC 签名）

唯一入口：`POST /api/public/worker/callback`（本项目新建，匿名可达，靠 HMAC 鉴权）。

Body：
```json
{
  "event": "target.progress | target.success | target.failed | target.cancelled
         | account.bound | account.cookie_expired | account.checked
         | login.scan_consumed | log",
  "occurred_at": "ISO8601",
  "worker_id": "worker-cn-1",
  "data": { ...因事件不同... }
}
```

### 3.1 target.* 事件
```json
{
  "target_id": "uuid",
  "claim_token": "uuid",
  "progress": 0-100,
  "last_step": "string",
  "platform_post_id": "string?",
  "platform_post_url": "string?",
  "error_code": "string?",
  "error_message": "string?",
  "retry_after_seconds": "number?"
}
```
Cloud 行为：
- `progress`：仅更新 `progress` + `last_step`。
- `success`：写 `status='success'` + 平台 id/url + `finished_at`。
- `failed`：写 `status='failed'` + 错误，如果 `retry_after_seconds` 给了，重新置为 `pending` 并 +1 `retry_count`（达到上限 `social_publish_jobs.retry_count >= 3` 则真正失败）。
- `cancelled`：写 `status='cancelled'`。
- 任何 target 状态写入后都触发 trigger，重新汇总 `social_publish_jobs.status`。

### 3.2 account.* 事件
```json
{
  "account_id": "uuid",
  "worker_account_id": 123,
  "worker_account_key": "string",
  "account_name": "string?",
  "avatar_url": "string?",
  "capabilities": { "image_text": true, "video": true, "schedule": false },
  "content_kinds": ["image_text","video"],
  "cookie_status": "valid | expired | disabled"
}
```
- `account.bound`：登录完成，写齐字段并置 `cookie_status='valid'`。
- `account.cookie_expired`：置 `cookie_status='expired'`，触发大盘提醒。
- `account.checked`：日常体检，只更新 `last_check_at` + `cookie_status`。

### 3.3 login.scan_consumed
只是告诉前端「二维码已被扫了，等手机确认」，写一行进 `marketing_video_jobs/notifications`（待定），前端轮询。

### 3.4 log
非关键日志，写一行进 `worker_logs` 表（Phase 2 新增），便于排错。

---

## 4. 文件交付

- 全部素材来源：Supabase Storage bucket `marketing-assets`。
- Cloud 在 `dispatch-cron-tick` 返回 target 数据时，把图片/视频/封面替换为 **签名 URL（有效期 6 小时）**。
- Worker 直接 HTTPS GET 下载，不能反向连 Supabase。
- Worker 上传到平台后，可以在回调里返回 `platform_media_id`，方便后续二次编辑。

---

## 5. 平台能力表

- `social_platform_specs` 表是 Cloud + Worker 共同的「能力字典」（每平台的 body_max / images_max / video_seconds_max / supports_schedule 等）。
- PC 端在向导里读它做校验。
- Worker 在投递前再次校验，发现超限直接返回 `target.failed(error_code='spec_violation')`，不要硬投。

---

## 6. 错误码约定

| code | 含义 | Cloud 处理 |
|---|---|---|
| `cookie_expired` | 账号 cookie 失效 | 同步把 `social_accounts.cookie_status='expired'` |
| `rate_limited` | 平台限流 | 自动重试（5/15/30 分钟） |
| `spec_violation` | 内容不符合平台规则 | 不重试，直接失败 |
| `network_error` | 网络/平台抽风 | 自动重试（1/3/10 分钟），最多 3 次 |
| `account_blocked` | 平台封号 | 不重试 + `social_accounts.cookie_status='disabled'` + 强提醒 |
| `media_unavailable` | 签名 URL 过期 / 损坏 | Cloud 重新签名后重试 |
| `internal_error` | Worker 内部错 | 重试 1 次后失败 |

---

## 7. 给 Codex 的第一批问题（请用户转述）

1. 现有 Worker 部署在哪里？我们要把 Cloud 端的回调 URL 配上反向能力。
2. `worker_account_id`(int) + `worker_account_key`(text) 在新契约下是否保留？或者改成 Cloud 主键 uuid 即可？
3. 扫码二维码：可以输出 base64 PNG 给 Cloud 透传给前端吗？
4. 当前真实跑通的平台 / 内容类型有哪些？分别处于「mock / 半成品 / 已上线」哪个阶段？
5. Worker 能从 HTTPS 签名 URL 下载素材吗？是否有出口 IP 白名单需求？
6. Worker 端打算用什么部署模型：常驻浏览器实例池 / 按需 launch / Docker pool？这影响我们 `claim_expires_at` 默认 15 分钟是否合理。
7. 同一个账号是否允许并发投递？还是必须串行（影响 Cloud 派单策略）。

---

## 8. 与现状的差异

相比 Genie 现有 `dispatch-*` 的实现，本契约主要变化：
1. 引入 **Worker 主动拉取** (`dispatch-cron-tick`) + 乐观锁 `claim_token`，废弃「Cloud 推 Worker」的同步调用，便于扩容多个 Worker。
2. 统一回调入口 `/api/public/worker/callback` + HMAC，废弃多个零散回调函数。
3. 文件全部走签名 URL，Worker 不再持有 Supabase 凭据。
4. `social_publish_targets` 增加 `progress / last_step / claim_token / claim_expires_at` 列。
5. 错误用 `error_code` 而非自由文本，便于 Cloud 决定重试策略。

---

## 9. Migration 清单（Cloud 端，Phase 0 完成后我立刻执行）

```sql
-- 9.1 给 social_publish_targets 补列
ALTER TABLE public.social_publish_targets
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

-- 9.2 新建 worker_logs 表（Phase 2，可选）

-- 9.3 新建 automation_tasks 表（Phase 2，自动化任务）

-- 9.4 新建 headquarters_publish_batches 表（Phase 2，总部跨门店批量）
```
完整 SQL 在 Phase 2 出。
