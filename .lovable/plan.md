## 调整方案

### 1. AI 创作中心（`/aigc`）— 移除冗余入口
- 删除页面底部「管理与分发」区块（素材库 + 内容分发两个 ManageTile），这两项已在左侧主导航中。
- 保留：短视频主入口 Hero + AI 图片 / AI 文案 副入口 + 底部品牌提示语。
- 同时移除文件中不再使用的 `Library`、`Send`、`ManageTile` 代码。

### 2. 发布中心（`/publish`）— 合并自动化任务
- 在 `/publish` 顶部加 Tabs（或分段控件）：「手动发布」｜「自动化任务」，默认手动发布。
  - **手动发布 Tab**：保留当前 `publish.tsx` 现有的任务创建 + 任务列表。
  - **自动化任务 Tab**：把 `automation.tsx` 的列表 + 新建任务流程整体迁入，作为同页 Tab 内容（直接复用 `automationApi`、现有组件结构）。
- 删除 `src/routes/_authenticated/automation.tsx` 路由。
- 左侧导航 `AppShell.tsx`：移除「自动化任务」菜单项；`TITLES` 表删除 `/automation`。
- 检查并清理对 `/automation` 的内部链接（工作台等），改指 `/publish`（带 `?tab=automation` 之类查询参数，便于深链）。

### 技术要点
- Tab 状态用 `useSearch` + `Route.useNavigate` 同步到 URL `?tab=manual|auto`，刷新和分享链接保留视图。
- 自动化的「新建任务」弹窗/抽屉保留原交互，仅迁移容器位置。
- `routeTree.gen.ts` 由插件自动重生成，删除 automation 路由文件即可。

### 不动的部分
- `/aigc/video`、`/aigc/image`、`/aigc/copy` 内容与流程不变。
- `automationApi`、`publishApi`、mock 数据不变。
- 素材库 `/assets`、账号 `/accounts`、设置 `/settings` 不变。
