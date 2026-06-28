## 目标

修复素材库的加载慢、交互不合理、kind 同步不全、缺标签管理四个问题。本次仅改 `src/routes/_authenticated/assets.tsx` 与 `src/api/assets.ts`，不动后端。

---

## 1) 加载慢 — 三个根因 + 修法

**根因 A：列表里直接渲染 `<video src=outputUrl>` 自动 fetch 元数据**。240 条里就算只有 14 条视频，每条都拉一次远端视频头部，外加首屏所有图片同时加载。
**根因 B：图片用原图全尺寸渲染**，卡片只有 ~180px 宽，浪费带宽。
**根因 C：一次性 select 全部 240 条**，没有分页/虚拟化。

修法（前端，不动数据库）：

- **卡片改为 `aspect-square`**（固定正方形），`<img>` 加 `loading="lazy" decoding="async"`，`object-cover`。
- **视频卡片不再渲染 `<video>` 标签**。优先用 `meta.thumbnail_url` / `meta.poster` / `meta.cover_url`（任一存在即可），否则显示带「▶ 视频」标记的占位渐变色块。点击放大入口时才真正播放。
- **缩略图 URL 优化**：如果 `output_url` 是 Supabase Storage 的 `…/storage/v1/object/public/…`，自动改写为 `…/storage/v1/render/image/public/…?width=400&quality=70`（Supabase 自带 image transform）。非 Storage URL 保持原样。封装在 `assets.ts` 的 `thumb(url)` 工具里。
- **首屏限量 + 「加载更多」**：`assetsApi.list` 增加 `limit`（默认 120）和 `offset`，页面底部出现「加载更多」按钮，避免一次塞 240+ DOM 节点。

预期效果：首屏请求体积量级下降，视频不再各自打头部请求。

---

## 2) 卡片交互重构（去掉「预览/发布」两个按钮）

现在每张卡底部有「预览」「发布」两个按钮，太挤。改为：

- **整张卡可点击 → 打开预览弹窗（Dialog）**：图片放大到原图、视频在弹窗内 `<video controls autoplay>` 播放、文案显示全文。
- **右上角悬浮一个「🔍 放大」小图标**（半透明圆形，hover 显形），明示「可点开看大图」，回答你说的「点击没有放大入口」。
- **右下角悬浮一个「发布」小图标**：
  - **视频**：单击 → 直接进入发布流程（单选单发，符合你说的"视频是点击之后发布"）。
  - **图片**：单图直接发布（不进入多选）。
  - **文案/分镜/角色/产品**：暂不显示发布图标（这些不是发布物）。
- 卡片底部只保留：标题（1 行）+ 门店名 + AI/上传 badge，腾出空间。

发布按钮先打桩成 toast「已加入发布队列」即可，真正接到 publish 流程是另一个 phase。

---

## 3) 分镜 / 角色 / 产品 / 视频 同步检查

共享库 `marketing_assets.kind` 是 `string`，目前我只把 `photo↔image` 做了映射。你看到「分镜/角色没同步」很可能是：

- 实际库里 `kind` 只用 `photo / video / copy` 三个值；
- 「分镜 / 角色 / 产品」是放在 `category` 或 `meta.subtype` 里，而不是独立 `kind`。

本次会做的事：

1. **加一次性诊断**：进入素材库时跑一条 `select distinct kind, category from marketing_assets` 用 console.debug 打出来一次（仅 dev，便于你截图给我看实际枚举值）。
2. **如果分镜/角色/产品真的在 `category` 字段**：调整 `dbKindToUi` 逻辑，先看 `category`（`storyboard / character / product`）再 fallback 到 `kind`，并允许侧栏按 `category` 过滤。
3. **如果库里压根没有这些类型的数据**：前端侧栏对应分类显示「0」是正常的，不是 bug，会在 UI 上加灰显提示「该类型暂无内容」。

诊断结果会写在你下一轮看到的回复里，必要时再发第二轮微调。

---

## 4) 标签管理 — 新增入口

现在没有任何标签管理。本次加：

- **页面顶部「批量打标」按钮** 改名为 **「标签管理」**，点击打开一个 Drawer/Dialog。
- Drawer 内容（v1，纯前端聚合 `marketing_assets.tags`）：
  - 列出所有出现过的标签 + 每个标签的素材计数；
  - 按使用次数排序，支持搜索；
  - 点击某个标签 → 关闭抽屉并把它写入顶部搜索框 `filters.search`，相当于「按标签筛选」。
- 重命名 / 合并 / 删除标签 涉及写库，**本次先不做**（数据库写权限和影响面要单独评估），抽屉里这些操作灰显并标注「Phase 2」。

---

## 文件改动

```text
src/api/assets.ts                       // thumb() URL 改写、limit/offset、诊断 distinct kind/category、按 category 兜底
src/routes/_authenticated/assets.tsx    // 正方形卡片、放大/发布悬浮按钮、预览 Dialog、加载更多、标签管理 Drawer
```

不动后端、不动其他 api、不动 mocks。

---

## 验证清单

1. 素材库首屏只渲染 ≤120 张卡片，DevTools Network 里图片体积明显比之前小（带 `render/image` 参数）。
2. 列表里没有任何 `<video>` 标签在自动拉流。
3. 卡片正方形、hover 右上角出现 🔍、视频/图片卡 hover 右下角出现发布图标，文案卡没有发布图标。
4. 点击卡片弹出预览 Dialog，视频可在弹窗内播放。
5. 顶部「标签管理」按钮可打开 Drawer，看到真实标签和计数，点标签能筛选。
6. 控制台能看到 `distinct kind/category` 的诊断输出，据此决定下一轮是否补 category 映射。