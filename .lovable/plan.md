# 只读核查结果 · Seedance 视频通道（中信泰富 15 秒女博主带逛）

本轮未改任何代码、未部署、未创建任何视频任务。以下为核实到的非敏感证据。

## 1. 后端归属

- 前端项目：本项目（AIGC 前端，cozy-genesis-dev）。
- 后端归属：共享 Supabase 项目 `narqwgwpqglathwtyevz`（对应 Lovable 项目 **Genie Lamp Descriptions** / 营销中心）。前端只用公开 anon key 连它（`src/integrations/shared-db/client.ts`），所有生成逻辑都在那边的 Edge Function 里。本会话对该后端只有只读权限。

## 2. 供应商模型映射

- 前端两条通道都把 `model` 默认写成 `"seedance-2-pro"`（`src/api/director-payload.ts` 的 `DEFAULT_DIRECTOR_MODEL` 与 `DEFAULT_SURPRISE_MODEL`），一键出片页面另有 fast/pro 选择，自定义导演台页面写死 pro。
- **这只是前端传给后端的字符串**。它到底映射到火山/即梦哪个真实模型 ID、是不是 Seedance 2.0，只写在后端 Edge Function 源码里，本项目里没有映射表，本会话读不到该后端源码，因此**未经证实**——需要在 Genie 项目会话里核对一次。

## 3. 是否可运行

- 六个函数端点均可达（预检返回 200）：`surprise-marketing-video`、`poll-marketing-video`、`generate-marketing-video-script`、`storyboard-marketing-video`、`director-create-job`、`director-poll-job`。
- 可达不等于可跑通：实际执行需要登录态 + 后端供应商密钥，未实测（按要求不发起生成）。

## 4. 两个生成入口与必填字段

一键出片（BOOMER 帮我拍，单段 15s）：
- 预览：`surprise-marketing-video`，body `shop_id / video_type / category / aspect / image_urls / duration=15 / model / resolution=720p / realism=photoreal / preview=true`
- 提交：同函数，`preview=false`，并把预览返回的 `script / assets / picked_assets / style` 原样回传
- 轮询：`poll-marketing-video`，body `{ job_id }`，`status=succeeded` 时取 `video_url`

自定义导演台（多镜）：`generate-marketing-video-script` → `storyboard-marketing-video` → `director-create-job` → `director-poll-job` → `director-complete-job`。

## 5. 鉴权方式

- 页面级：`/_authenticated` 路由在进入前调用 `supabase.auth.getUser()`，无会话跳 `/auth`；生产走 ERP SSO（`/auth/erp`，ticket 换 magiclink token 后 `verifyOtp`）。
- 接口级：`supabase.functions.invoke` 自动带 anon key + 当前用户 JWT。

## 6. 中信泰富素材 / 门头

- 门店已在库：`shops` 表有「上海中信泰富店」（id `72c80d98-…`，active，排序第 1）。
- 素材：`marketing_assets`、`marketing_video_jobs`、`marketing_characters` 在匿名身份下一律返回空数组（受 RLS 保护），**因此无法在无登录状态下确认门头照是否已入库**。
- 注意品牌资料里写的是「无门框、无门头墙、开放式陈列」的商场铺位，而现有探店规则又要求首镜必须是门头照——这两条需要你确认以哪张实拍图为准。

## 7. 端到端能否由我运行

可以，但需要一个有效登录会话（预览环境里你先登录一次即可注入）。目前会话没有该门店的可读素材权限，所以还不能确认参考图。按要求本轮不提交任何付费任务。

## 下一步（等你确认后再执行）

1. 你在预览里登录一次，我读取中信泰富的素材列表，确认门头照是否存在、拿到它的 URL。
2. 如无门头照：由你补拍上传，或改用店内入口图作首镜。
3. 我用一键出片通道跑 `preview=true`（不计费成片），把脚本 + 参考帧顺序给你审；首帧固定为门头照。
4. 你点头后再提交 `preview=false` 的 15 秒渲染任务并轮询取片。
5. 另需在 Genie 项目会话核对 `seedance-2-pro` 的真实供应商模型映射。
