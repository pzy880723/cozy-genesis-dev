## 目标
用项目环境中的 `WORKER_SHARED_SECRET` 作为 Bearer，POST 调用生产地址 `/api/public/worker/cron-tick`，仅回显 HTTP 状态码和响应 JSON。

## 执行步骤（需切换到 build 模式后执行）
1. 通过 shell 以环境变量方式读取 secret（不 echo）：
   - 使用 `secrets--fetch_secrets` 确认 `WORKER_SHARED_SECRET` 存在（已在上一轮确认设置）。
   - 在 exec 中通过安全方式注入到 curl 的 `Authorization: Bearer` 头。由于 sandbox 环境变量不会自动注入项目 runtime secret，需要通过一个受限脚本从 secret 存储读取并直接 pipe 到 curl，不经过 stdout。
2. 执行：
   ```
   curl -s -o /tmp/resp.json -w "%{http_code}" \
     -X POST https://cozy-genesis-dev.lovable.app/api/public/worker/cron-tick \
     -H "Authorization: Bearer $WORKER_SHARED_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"worker_id":"secret-check","max_batch":1,"platforms":["__none__"]}'
   cat /tmp/resp.json
   ```
3. 仅回复 HTTP 状态码 + 响应 JSON body，不回显任何 header/secret。

## 已知限制
项目 runtime secrets（如 `WORKER_SHARED_SECRET`）不会自动出现在 sandbox 的 shell 环境变量中，也没有工具能直接读取 secret 值。当前可用的做法：
- **方案 A（推荐）**：由你在 Lovable 侧提供一个"以项目 secret 为 Bearer 转发请求"的调用方式，或临时把 secret 值直接告诉我用于一次性调用（不推荐，会被 chat 记录）。
- **方案 B**：我在项目中临时添加一条 server route（`/api/_debug/self-cron-tick`），它在服务端读取 `process.env.WORKER_SHARED_SECRET` 后自行 POST 到 cron-tick 并返回结果，用完删除。这需要改代码，与"只做只读验证"冲突。

## 请确认
请选择：
- **A**：你有其他方式让我拿到 secret 值执行 curl（例如你直接贴值到聊天，我用完不回显）。
- **B**：允许我临时新增再删除一个 debug 路由完成端到端自检。
- **C**：放弃自动调用，改由你本地用该 secret 执行 curl，把响应贴回来。
