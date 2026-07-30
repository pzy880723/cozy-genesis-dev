# 一键视频「反向提取人物封面」— Cloud 改造交付包

> 目标库：共享 Supabase `narqwgwpqglathwtyevz`（源码在 **Genie Lamp Descriptions** 项目）。
> 本 AIGC 项目（cozy-genesis-dev）对该项目只有**只读**跨项目工具，无法写入/部署，
> 因此完整实现放在这里，请在 Genie 项目会话里落地并部署。

## 一、新增文件（直接复制）

| 交付包路径 | 目标路径 |
| --- | --- |
| `_shared/cover-generation.ts` | `supabase/functions/_shared/cover-generation.ts` |
| `cover-claim-next/index.ts` | `supabase/functions/cover-claim-next/index.ts` |
| `cover-heartbeat/index.ts` | `supabase/functions/cover-heartbeat/index.ts` |
| `cover-callback/index.ts` | `supabase/functions/cover-callback/index.ts` |
| `tests/cover-generation.test.ts` | `supabase/functions/tests/cover-generation.test.ts` |

`supabase/config.toml` 追加（Worker 三函数用自定义 token，不用 JWT）：

```toml
[functions.cover-claim-next]
verify_jwt = false
[functions.cover-heartbeat]
verify_jwt = false
[functions.cover-callback]
verify_jwt = false
```

## 二、poll-marketing-video 的两处最小改动

**1) 排队封面任务** —— 在单段任务判定为 `succeeded` 且已拿到 `video_url`、
回写 `marketing_video_jobs.status='succeeded'` 之后，加：

```ts
import { queueCoverGeneration } from "../_shared/cover-generation.ts";
// ...视频成功回写之后：
await queueCoverGeneration(admin, {
  id: job.id,
  shop_id: job.shop_id ?? null,
  script: job.script || {},
  video_url: finalVideoUrl,
  fallback_notes: job.fallback_notes,
});
```

`queueCoverGeneration` 幂等（已存在 cover_generation 就跳过），只写
`fallback_notes.cover_generation`，不动其它键、不动视频状态。
select 列表里需要补 `shop_id, fallback_notes`。

**2) 响应扩展** —— 保留原有 `status/video_url/segment_*`，在返回对象里追加：

```ts
import { readCoverGeneration } from "../_shared/cover-generation.ts";
const cg = readCoverGeneration(job.fallback_notes);
// ...
return json({
  ...原有字段,
  cover_status: cg?.status ?? null,      // 旧历史任务没有 → null，前端按旧逻辑兼容
  cover_url: cg?.cover_url ?? null,
  cover_error: cg?.error ?? null,
  cover_progress: typeof cg?.progress === "number" ? cg.progress : null,
});
```

只有 `status==='succeeded' && cover_status==='succeeded'` 才算完整可发布。
不批量改历史数据。

## 三、Worker 契约

- `POST /functions/v1/cover-claim-next`，header `X-Worker-Token`，body `{worker_id}`
  → `{ok:true, job:{id,video_url,script,cover_generation}, claim:{callback_url,heartbeat_url,claim_expires_at}}`
  或 `{ok:true, job:null}`。
- `POST /functions/v1/cover-heartbeat` body `{job_id,worker_id,progress}`。
- `POST /functions/v1/cover-callback`
  成功 `{job_id,cover_url,reference_frame_count,copy_fingerprint,variation_key}`；
  失败 `{job_id,error}`。

claim TTL 15 分钟；过期的 claimed/generating 可被重新领取，`attempt` 累加。
并发通过 PostgREST 的 jsonb 路径 CAS（`fallback_notes->cover_generation->>status` /
`->>claimed_by`）保证同一条不会被两个 Worker 同时拿到。

## 四、Secrets

- Supabase 需新增 **`COVER_WORKER_TOKEN`**（与腾讯云 Worker 一致的随机串）。
- **`ARK_API_KEY` 只放腾讯云 Cover Worker**，不要加到 Supabase 的封面链路里。