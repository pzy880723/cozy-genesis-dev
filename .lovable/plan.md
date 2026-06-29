## 目标

把 `/aigc` 从"5 个并列创作类型（图文 / 脚本 / 分镜 / 视频任务 / 标题）"改造成跟手机端项目 **Genie Lamp Descriptions** 一致的"短视频生成"主线流程。脚本、分镜静帧、渲染、失败重试都是这条流程内部的步骤，不再作为并列入口。AI 图片、AI 文案保留为副入口。

参考源：`Genie Lamp Descriptions` 项目
- `src/pages/MyMarketing.tsx` —— 营销中心入口
- `src/pages/marketing/MarketingVideo.tsx` —— 视频生成主流程（1421 行）
- `src/pages/marketing/MarketingPhoto.tsx` / `MarketingCopy.tsx` / `AiImage.tsx`
- `src/pages/marketing/dispatch/*` —— 分发中心（当前 PC 的 `/publish` 已有）

## 新的 PC 端 AIGC 信息架构

```text
/aigc                         创作中心首页（替换现在的 5 选 1 布局）
  ├─ Hero：本月产出统计 + "惊喜一下"按钮（暂用 toast 占位，后续接入）
  ├─ 主入口卡：AI 短视频 →  /aigc/video
  └─ 副入口：AI 图片 → /aigc/image    AI 文案 → /aigc/copy
        管理：素材库（已存在 /assets）  分发（已存在 /publish）

/aigc/video                   短视频生成主流程（核心改造）
  分 5 个步骤区块，单页竖向排列，照搬 MarketingVideo.tsx 的状态机：

  1. 归属 & 参考素材
     - 门店选择（复用现有 shopsApi）
     - 参考图：从素材库选 / 本地上传（mock 即可，先放 UploadGrid 风格的网格）
     - 选主角色（CharacterPicker 占位：列表 + "暂不选"）

  2. 立意（BriefChat）
     - 左：和 AI 对话区，用户描述想拍什么；右：AI 追问 / 给出 draft_script
     - mock：调用 aigcApi.generateCopy 的现成 mock 数据，渲染成对话气泡

  3. 视频参数
     - 类型：探店 / 产品展示 / 店铺氛围 / 新品上架
     - 风格：稳重 / 活泼 / 激动 / 优雅 / 怀旧 / 俏皮
     - 时长：15 / 20 / 30 / 45 / 60s
     - 比例：9:16 / 1:1 / 16:9
     - 高光一句话（textarea）

  4. 生成脚本 + 分镜静帧
     - "生成脚本"按钮 → 调 aigcApi.generateScript（已存在）拿到 scenes 数组
     - 每个 scene 一张卡：时间码 / 画面描述 / 旁白 / 静帧占位图 + "重做这一镜"按钮
     - 顶部状态条：N/M 分镜静帧已合成；缺失时禁用下一步

  5. 渲染设置 & 提交
     - 模型选择（占位下拉：Seedance 1.0 / 2.0 …）
     - 分辨率（480p / 720p / 1080p）
     - 写实度切换（写实 / 插画）
     - 渲染策略（自动 / 整段一次 / 按镜分段）
     - "确认生成视频"按钮 → 模拟创建一个 job，跳到任务面板
     - 任务面板：阶段（queued / scripting / rendering / stitching / done / failed）+ 进度
     - 失败时显示 VideoFailureCard 风格的"修复建议"按钮组（降清晰度 / 关参考图 / 换模型 / 删除任务）

/aigc/image                   把现在的"图文生成 / 标题/标签"两类合并到这里
  - 上传或选库内图，对话改图、出海报、加文字，输出多张候选

/aigc/copy                    现在的"图文生成"文案部分
  - 选素材 + 平台多选 + 补充要求 → 标题 / 正文 / 标签 / 平台适配建议（已有 generateCopy mock）
```

## 文件变更清单

- `src/routes/_authenticated/aigc.tsx` —— 重写为首页（Hero + 4 张入口卡），删掉左侧 5 类型 + 中间输入 + 右侧输出的三栏布局。
- `src/routes/_authenticated/aigc.video.tsx` —— 新增，主流程页（参照 MarketingVideo.tsx 的 5 步骤结构，PC 横向布局，UI 用现有 shadcn 组件 + tailwind）。
- `src/routes/_authenticated/aigc.image.tsx` —— 新增（占位实现，可继续迭代）。
- `src/routes/_authenticated/aigc.copy.tsx` —— 新增（把现在 aigc.tsx 里的"图文生成"输入/输出搬过来）。
- `src/api/aigc.ts` —— 扩 mock：
  - `generateBrief({ userMsg })` 返回 AI 追问/draft_script
  - `generateStoryboard({ scenes })` 给每个 scene mock 一个静帧 URL（用 picsum 占位即可）
  - `submitRenderJob(...)` 返回 mock jobId
  - `pollRenderJob(jobId)` 依次返回 queued → rendering → done，最后给一段公开 mp4 URL
  - 保留现有 `generateCopy` / `generateScript`
- `src/components/app/AppShell.tsx` 侧边栏：把"AI 创作中心"链接保持指向 `/aigc`，子项不变。

## 不在本次改动范围

- 真接 LLM / 视频模型：全部走 mock，跟现在 aigc.ts 风格一致。
- 角色管理、活体认证、Seedance 模型实际清单：占位下拉即可。
- `/publish`、`/assets`、`/automation` 等其它页面不动。

## 验收

- `/aigc` 首页不再是 5 个并列类型，而是「AI 短视频」作为主推 + 图片/文案副入口 + 管理分发引导。
- `/aigc/video` 单页竖向走完：选店铺/素材 → 聊立意 → 设参数 → 生脚本 + 分镜静帧 → 设渲染 → 提交 → 看任务进度，所有步骤都有 mock 数据反馈。
- 失败任务能看到"修复建议"卡，点按钮能回到上一步重新提交。
- 现有 `/aigc` 老页面的"图文生成 / 标题/标签"内容迁移到 `/aigc/copy`，不丢功能。
