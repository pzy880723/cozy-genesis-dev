# 部门帮我拍 · 一键生成 15s 视频

在「AI 创作中心」加入口「部门帮我拍 · 一键出片」：用户只勾几下 → 自动选图 → AI 写脚本+设计角色 → 直出 15 秒成片。

## 入口与位置

- `src/routes/_authenticated/aigc.index.tsx`：在「AI 短视频」旁加高亮卡片 **部门帮我拍**，副标题「一键自动选图 + 自动脚本 + 直出 15s」。
- 新路由：`src/routes/_authenticated/aigc.oneclick.tsx`（`/aigc/oneclick`）。
- `/aigc/video` 顶部加一条「想更快？试试一键出片 →」浅色提示条。

## 品牌资料（设计依据，新增）

视频脚本、画面调性、角色形象都基于「店铺品牌资料」生成，因此先在 Shop 上加几个后台字段，作为 AI 一键出片的素材：

`src/types/index.ts` Shop 新增可选字段：
- `brandName`：品牌名（如「瓷器天堂」）
- `brandIntro`：品牌介绍（长文本，1–3 段）
- `brandTone`：品牌语调（如「沉稳 / 国风 / 治愈」）
- `categories: string[]`：在售品类标签池（如 `["瓷器","茶具","香器"]`）
- `primaryCategory?: string`：主营品类（默认探店倾向）

`src/api/shops.ts` + `src/mocks/data.ts`：补两家示例店铺的 brand 资料；`/settings` 页面顺手露一个「品牌资料」编辑卡（最小可用 textarea + 标签输入），让后台能改。

> 一键出片调 `generateVideoScript` 时，把 `brandIntro / brandTone / 选中类型 / 倾向品类` 拼到 `highlight`（VideoBrief 已有该字段），不改接口签名。

## 页面流程

```
┌── 01 归属店铺 ─────────────────────────────┐
│ 门店下拉 + 品牌资料预览卡（只读）           │
│   品牌名｜语调标签｜介绍前两行 [展开]       │
│   底部小字：「AI 会按品牌资料设计画面与角色」│
└────────────────────────────────────────────┘

┌── 02 视频类型（多选，至少 1）────────────────┐
│ ☐ 探店       ☐ 上新       ☐ 环境           │
│ ☐ 品牌介绍   ☐ 活动       ☐ 顾客好评       │
│ （都是大类型，不含细分品类）                │
└────────────────────────────────────────────┘

┌── 03 倾向品类（单选，来自店铺 categories）──┐
│ ⦿ 全品类  ○ 瓷器  ○ 玩具  ○ 黑胶          │
│ ○ 数码    ○ 玩偶（动态来自店铺 categories）│
│ 默认值：店铺 primaryCategory，否则「全品类」 │
└────────────────────────────────────────────┘

┌── 04 自动选图（最多 9 张）──────────────────┐
│ [ 一键自动挑图 ]                            │
│ 规则：source='upload'（排除 AI 生成）        │
│      shop = 当前店铺                        │
│      按 视频类型 + 倾向品类 给标签打分 Top 9│
│ 选好后展示 9 格缩略图 + 单张「替换 / 删除」  │
│ 「再来一组」可换批                          │
└────────────────────────────────────────────┘

┌── 05 生成设置 ─────────────────────────────┐
│ 时长：15s（固定，「CDS 单段上限」）          │
│ 模型：⦿ Fast（默认）  ○ PRO                │
│ 画幅：⦿ 9:16  ○ 1:1  ○ 16:9                │
│ [ ✨ 一键生成 ]                              │
└────────────────────────────────────────────┘

┌── 结果面板 ───────────────────────────────┐
│ ① AI 编剧中（基于品牌资料）                 │
│ ② AI 设计角色形象                           │
│ ③ 镜头渲染中（进度条）                      │
│ ✅ 出片完成 → <video> 预览 + 下载 + 去发布  │
│ 失败 → 降到 Fast / 换一组图 / 重试          │
└────────────────────────────────────────────┘
```

## 文案

- **入口卡标题**：部门帮我拍
- **入口卡副标题**：选店铺 → 勾类型 → 一键 15 秒成片，脚本、角色都交给 AI
- **品牌资料卡说明**：AI 会按这份品牌资料设计画面、旁白与角色
- **一键挑图按钮**：一键自动挑图（最多 9 张）
- **挑图说明**：仅从「上传素材」中挑选，不含 AI 生成图
- **类型未选**：至少勾一个视频类型
- **提交按钮**：✨ 一键生成 15s 视频
- **阶段标题**：① AI 编剧 → ② 设计角色 → ③ 镜头渲染 → ✅ 完成
- **结果操作**：下载 MP4 / 去发布中心 / 重新生成

## 数据 & 接口

`src/types/index.ts`：Shop 增 `brandName / brandIntro / brandTone / categories / primaryCategory`。

`src/api/aigc.ts`：
- `pickAutoAssets({ shopId, types, category, max:9 })` → `{ assets, reason[] }`，硬过滤 `source==='upload'`，按 `types + category` 与 asset `tags/category` 加权排序取前 9。
- `oneClickGenerate({ shopId, types, category, assetIds, aspect, modelId })`：内部串 `generateVideoScript`（duration 写死 15，type 取首个，highlight 自动拼「品牌介绍 + 语调 + 多选类型 + 倾向品类」）→ `generateStoryboard` → `submitRenderJob`（duration 15、strategy `one_shot`、resolution `720p`）。返回 `{ jobId, script }`，前端复用 `pollRenderJob`。

`src/mocks/data.ts`：
- 两家示例店铺补 brand 资料（「瓷器天堂」: tone 国风沉稳, categories 瓷器/茶具/香器；「玩具天堂」: tone 治愈俏皮, categories 玩偶/黑胶/数码）。
- 给现有 image asset 补 `source:'upload'` 与若干 `category`/`tags`，确保打分有结果。

## 关键约束

- 选图来源 **必须** `source==='upload'`；不足 9 张时按现有数量并提示「仅 N 张，可继续或去上传更多」。
- 视频类型只暴露大类型（探店 / 上新 / 环境 / 品牌介绍 / 活动 / 顾客好评），不出现「瓷器介绍」「玩具介绍」这类细分。
- 倾向品类单选，选项来自当前店铺 `categories` + 「全品类」。
- 时长 15s 固定；策略 `one_shot` 固定。
- 模型默认 Fast；可切 PRO。

## 改动清单

- 新增：`src/routes/_authenticated/aigc.oneclick.tsx`
- 修改：`src/routes/_authenticated/aigc.index.tsx`（入口卡）
- 修改：`src/routes/_authenticated/aigc.video.tsx`（跳转提示条）
- 修改：`src/routes/_authenticated/settings.tsx`（最小品牌资料编辑卡）
- 修改：`src/api/aigc.ts`（`pickAutoAssets` / `oneClickGenerate`）
- 修改：`src/api/shops.ts`（保存/读取品牌资料）
- 修改：`src/types/index.ts`、`src/mocks/data.ts`

## 验收

1. 入口可见；切换店铺时品牌资料卡同步刷新。
2. 视频类型仅大类型；倾向品类来自店铺 categories。
3. 自动挑图仅「上传」图，最多 9 张，可重挑。
4. 一键生成后 4 阶段进度可见，结束播放 15s 视频。
5. 模型默认 Fast，切 PRO 立刻生效。
6. `/settings` 可编辑品牌资料并立即影响一键出片结果。
