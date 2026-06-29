# Worker ↔ Cloud 对接交接单

> 给腾讯云 Worker（Codex 维护）的 single source of truth。
> Cloud 端 = 本仓库（TanStack Start on Cloudflare）。

---

## 1. 终端 URL

| 项 | 值 |
|---|---|
| Cloud Base URL（生产） | `https://cozy-genesis-dev.lovable.app` |
| Cloud Base URL（稳定预览） | `https://project--3a5a8bad-dfde-4d66-8cd6-9786e7370c8e.lovable.app` |
| `WORKER_CLOUD_BASE_URL` 推荐值 | `https://cozy-genesis-dev.lovable.app` |

三个 HTTP 端点（全部走 `/api/public/*`，绕过登录鉴权，由 header 自管）：

| 用途 | 方法 | 路径 |
|---|---|---|
| Worker 拉单 | POST | `/api/public/worker/cron-tick` |
| Worker 回调（target/account 状态） | POST | `/api/public/worker/callback` |
| 自动化任务调度（Cloud 内部 cron 调用） | POST | `/api/public/cron/automation-tick` |

---

## 2. 鉴权

- **Secret 名**：`WORKER_SHARED_SECRET`（已经在 Cloud 端生成并入库；我把同一个值给你写到 `.env.worker`）。
- **cron-tick / automation-tick**：`Authorization: Bearer ${WORKER_SHARED_SECRET}`。
- **callback**：HMAC-SHA256：
  - Header `X-Worker-Timestamp`: 毫秒级 UNIX 时间戳（Cloud 容忍 ±5 分钟）
  - Header `X-Worker-Signature`: `hex(hmac_sha256(secret, timestamp + "." + raw_body))`
  - 签名材料是 **raw JSON body**，不要先 pretty-print 再签。

Python 端示例：
```python
import hmac, hashlib, time, json, requests
ts = str(int(time.time() * 1000))
raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
sig = hmac.new(SECRET.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
requests.post(url, data=raw.encode("utf-8"), headers={
    "Content-Type": "application/json",
    "X-Worker-Timestamp": ts,
    "X-Worker-Signature": sig,
})
```

---

## 3. cron-tick：领单

**请求**：
```json
POST /api/public/worker/cron-tick
Authorization: Bearer <WORKER_SHARED_SECRET>
{
  "worker_id": "tencent-cn-1",
  "max_batch": 10,
  "platforms": ["xhs","douyin","kuaishou","wechat_channels"]  // 可选；不传 = 全部
}
```

**响应**（`targets` 为空数组时表示当前没单，正常）：
```json
{
  "ok": true,
  "count": 1,
  "targets": [
    {
      "target_id": "uuid",
      "claim_token": "uuid",            // 回调时务必带回，Cloud 用来防错领
      "claim_expires_at": "ISO-8601",   // 15 分钟，超时未回 Cloud 可重新派
      "worker_task_id": "tencent-cn-1:...",
      "job_id": "uuid",
      "platform": "xhs",                // DB 内枚举，见下方平台映射
      "kind": "image_text",             // "video" | "image_text" | "copy"
      "title": "...",
      "body": "...",
      "tags": ["..."],
      "schedule_at": null,              // ISO-8601 或 null；Cloud 已过滤未到点的
      "cover_url": null,
      "asset_urls": ["https://..."],    // 已展开 marketing_assets.output_url；v1 不签名
      "account": {
        "id": "uuid",                    // 我们的 social_accounts.id（回调时用）
        "worker_account_key": "hq-xhs-main",  // 你本地 cookie 文件夹名
        "worker_account_id": 12,
        "account_name": "hq小红书主号",
        "platform": "xhs",
        "cookie_status": "valid"
      },
      "per_platform": null,
      "automation_task_id": null
    }
  ]
}
```

**平台枚举（Cloud → 你本地）**：

| Cloud (DB) | 你本地常见叫法 |
|---|---|
| `xhs` | xiaohongshu |
| `douyin` | douyin |
| `kuaishou` | kuaishou |
| `wechat_channels` | tencent / 视频号 |

建议 Worker 侧加一层 `platform_map`，免得我们其中一边改名时彼此都要迁移。

---

## 4. callback：回写状态

所有事件 body 顶层结构：
```json
{ "event": "...", "target_id"|"account_id": "...", "claim_token": "...(target 事件强烈推荐)", "data": { ... } }
```

支持的事件：

| event | 必填 id | data 字段 | Cloud 行为 |
|---|---|---|---|
| `target.progress` | `target_id` | `progress` (0-100), `step` (string) | 更新进度，status→running |
| `target.success` | `target_id` | `platform_post_id?`, `platform_post_url?` | status=success, progress=100, finished_at=now |
| `target.failed` | `target_id` | `error_message`, `retry_after_seconds?` (>0 且 retry_count<3 → 自动回 pending) | status=failed 或回 pending+retry_count+1 |
| `target.cancelled` | `target_id` | `error_message?` | status=cancelled |
| `account.bound` | `account_id` | `worker_account_key`, `worker_account_id?`, `account_name?`, `capabilities?` | cookie_status=valid |
| `account.cookie_expired` | `account_id` | — | cookie_status=expired（前端会高亮该账号） |
| `account.checked` | `account_id` | `ok: bool`, `last_check_at?` | cookie_status=valid/expired |
| `log` | — | `message`, `level?` | 仅 console.log，不入库 |

错误码：401 鉴权失败 / 400 参数错 / 404 target 不存在 / 409 claim_token 不匹配 / 500 服务端错。

---

## 5. automation-tick：内部 cron（你不调用）

由 **Cloud 这边自己的 1 分钟级定时器** 调用，把 `automation_tasks` 转成 `social_publish_jobs + targets`，落进队列。
你的 Worker 看到的就是普通 job，逻辑无差异。

> 第一版我会用一个最简单的外部 cron（cron-job.org 或腾讯云定时函数）每分钟打一次 `POST /api/public/cron/automation-tick`，Bearer 同一个 secret。如果你那边方便顺便起这个 cron 也行。

---

## 6. 关于你提的 3 个确认

1. **`worker_account_key` 就是你本地 cookie 账号名**
   ✅ 是。Cloud 端 `social_accounts.worker_account_key` 就是给 Worker 用的本地唯一键，建议格式 `<shop>-<platform>-<seq>`，例如 `hq-xhs-main`、`store01-douyin-2`。绑定流程：Worker 扫码完成后回调 `account.bound` 把 key/账号名补全。

2. **每个 target payload 都带 `account.id`**
   ✅ 是。`account.id` = `social_accounts.id` (uuid)。Cookie 失效时回 `account.cookie_expired` + `account_id`，Cloud 会把该账号置为 `expired`，前端立刻可见。

3. **视频号图文 = Phase 2**
   ✅ 同意。v1 视频号只做视频；图文等 Phase 2。Cloud 端不会派图文给视频号 target —— 因为视频号账号的 `capabilities` 里我们不会标 `image_text=true`，自动化和手动发布 UI 都会过滤。你 Worker 端如果意外收到，可以直接 `target.failed` + `error_message="visual_channels image_text not supported in v1"`，Cloud 会按失败处理。

---

## 7. 端到端验收脚本

1. 在前端「发布中心」手动建一条 job（任选一个有效账号）。
2. Worker 执行 `python -m worker.runner`，看到 cron-tick 返回 `count=1`，target_id 落地。
3. Worker 跑一遍上传器，期间至少回 1 条 `target.progress`，最后 1 条 `target.success`。
4. 5 秒内前端 job 卡片应自动从 "running" 翻到 "success"，target 行出现 `platform_post_url`。
5. 把这一个账号 cookie 删掉，再发一次 → 回 `target.failed` + `account.cookie_expired` → 前端账号灰显、job 标失败。

---

## 8. Cloud 端待办（我这边）

- [x] 三个 HTTP 端点（cron-tick / callback / automation-tick）
- [x] HMAC + Bearer 校验
- [x] target 状态变化触发 job 汇总（DB trigger）
- [x] `automation_task_id` 字段 + 每日配额
- [ ] 部署完，把 prod URL + Secret 通过安全渠道发给你（**等你这条消息确认后我就发**）
- [ ] 配置 1 分钟 cron 调 `automation-tick`
- [ ] Phase 2：素材签名 URL、视频号图文、Cloud→Worker 主动取消/重试