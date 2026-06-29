# 全局 UI 改版方案

锁定的设计语言（你刚选的）：
- 配色：Charcoal & Ember — `#1a1a1a / #2d2d2d / #4a4a4a / #e85d3a`
- 字体：DM Serif Display（标题，自托管 @fontsource）+ Fira Sans（正文）
- 结构：Dashboard 多面板（顶栏 + 侧栏 + 内容多卡片）

下面三个方向只在**构图密度 / 节奏 / 强调点 / 动效**上不同；token 与字体一致。请选择 1 个，我会按它做**全局**改版（AppShell + 所有路由：工作台、AIGC、素材库、发布、账号、设置、BOOMER 帮我拍）。

---

## 方向 A · "Editorial Console"（杂志感控制台）

**气质**：像翻一本黑色封面的设计年鉴。大量留白，强排版，DM Serif 大字号做"栏目页"。
**做法**：
- 顶部加一条 **64px Editorial Header**：左侧巨大 serif 路由名 + 右侧细灰色面包屑/Kicker（`AIGC / VIDEO / ONE-CLICK`，等宽小写）
- 主体改为 **12 栏栅格**，卡片不再是统一圆角白卡，而是 **细 1px 边 + 无阴影 + 大间距**（gap-8），分隔靠 hairline 而不是色块
- Step Panel 改成 **"01 · 02 · 03" 的左侧数字标号**（DM Serif 48px，橙色）+ 右侧内容，去掉 Panel 外框
- 强调色只用在**单一动作按钮**和**当前进度数字**，其余全灰阶
- 微动效：路由切换时标题做 8px y-fade（200ms），按钮 hover 仅描边变橙

**适合**：你想要"很有调性、像作品集"的感觉，截图截下来好看。
**代价**：信息密度下降约 20%，长列表需要滚动更多。

---

## 方向 B · "Dense Operator"（高密度操作台 · 推荐）

**气质**：Linear / Retool / Bloomberg 的混血。一切都在一屏内，键盘可达，专业人士工具。
**做法**：
- 侧栏从 240px 收窄到 **220px**，加 **可折叠到 56px** 的图标态；底部加快捷键提示
- 顶栏改为 **48px**（更薄），加 **全局 Command Palette**（`⌘K`）入口替换搜索框
- 主区改 **三段式**：左 1/4 = 步骤目录（sticky）+ 中 2/4 = 当前 Step + 右 1/4 = 实时预览/日志/脚本
- 表单控件统一 **32px 高**、`Fira Sans 12px`、tabular-nums；橙色仅出现在**主要 CTA、当前 Step badge、进度条**
- BOOMER 一键页：左侧步骤树常驻，右侧 9 宫格选图+脚本+视频预览并列；不再上下长滚
- 微动效：所有面板 enter 用 120ms 平移+淡入；进度条用 stripe shimmer

**适合**：你说"AIGC 工作台"的本质——每天高频使用、多步骤、要快。
**代价**：首次上手需要 1 次引导。

---

## 方向 C · "Atelier Dark"（暗色工作室）

**气质**：默认深色 `#1a1a1a` 主背景，内容卡片 `#2d2d2d`，像 Figma + Runway 的暗房；橙色发光更亮眼。
**做法**：
- 主背景翻黑，正文用 `#e8e6e1` 暖白；卡片为深炭色带 1px `#3a3a3a` 边
- 所有图片/素材在深背景上自带"画廊感"，9 宫格预览特别出彩
- 顶栏改为 **半透明毛玻璃**（`backdrop-blur`），随滚动出现 hairline
- CTA 按钮：橙色 + 6px 外发光（`shadow: 0 0 0 1px #e85d3a, 0 8px 24px -8px #e85d3a66`）
- 进度/状态用霓虹小点（绿/橙/灰），不用大色块
- 提供**亮/暗双主题切换**（顶栏右上），亮主题就是方向 B 的灰白版

**适合**：内容（图片/视频）是主角的产品，发布前预览体验最好。
**代价**：长时间看表格略累；需要重做所有 token 的暗色对版。

---

## 技术改造范围（任选一个方向都一样）

1. **Token 重写** `src/styles.css`
   - 新增 `--ember`, `--charcoal-1/2/3`, `--ink`, `--hairline`, `--shadow-elegant`
   - `@theme inline` 映射到 shadcn 的 `--background / --foreground / --primary / --border / --muted` 等
   - 用 `oklch()` 表达，保证亮暗一致
2. **字体加载**
   - `bun add @fontsource/dm-serif-display @fontsource-variable/fira-sans`
   - 在 `src/main.tsx` 或 `__root.tsx` 引入；`@theme` 设 `--font-serif`、`--font-sans`
3. **AppShell 重做** `src/components/app/AppShell.tsx`
   - 侧栏 / 顶栏 / Command Palette（仅 B、C）/ 主题切换（仅 C）
4. **共享组件 Panel/PageHeader 升级** `src/components/app/PageHeader.tsx`
   - 增加 `variant: "editorial" | "dense" | "atelier"`，全站统一调用
5. **逐页适配** 6 个路由 + BOOMER 一键页
   - 主要改 className，不动业务逻辑
6. **shadcn 组件 variant** 增加 `button` 的 `ember`/`ghost-hairline`、`badge` 的 `kicker`/`neon`
7. **不动的内容**：路由结构、API、所有业务文案/规则、BOOMER 品牌铁律

---

## 我需要你回答

请回复 **A / B / C** 任一个（或"B 但用 C 的暗色"这种组合也行），我直接进入改造。

如果你希望我先**渲染 3 张高保真静态预览图**让你眼见为实，再说一句"先出图"，我会用图像生成一张接一张地出，然后再动代码。