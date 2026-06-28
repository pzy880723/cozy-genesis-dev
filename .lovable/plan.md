## 目标

1. 卡片只展示**图片本体（正方形）**，去掉下方文字栏，让网格看起来就是一张张正方形图。
2. 没有真实标题的素材，不显示"未命名素材"占位文字。
3. 点击缩略图能正常弹出大图 / 正常播放视频。

## 改动范围

只动一个文件：`src/routes/_authenticated/assets.tsx` 和 `src/api/assets.ts`（仅 title 处理）。其它逻辑、筛选、分页、来源标识全部保持不变。

## 1. 卡片：只剩正方形图

- 删掉卡片底部的 `px-2.5 py-2` 标题/门店/AI 标签整块。
- 卡片外层去掉 `border` 与白底，让 `aspect-square` 的图片直接铺满，圆角保留 `rounded-md overflow-hidden`。
- `<img>` 保持 `w-full h-full object-cover`，确保任意比例的原图都被裁成正方形展示，不会被拉伸。
- 文案卡（kind=copy 无图）仍然显示文本块（保持可读），底色用 `bg-secondary`。
- hover 时右上角放大图标、右下角发布按钮保留；左上"视频"标、左下"手机/PC"角标保留。
- 鼠标悬停时在图片底部叠一条半透明渐变（`bg-gradient-to-t from-black/55`）+ 小字门店名，**只在 hover 时出现**，不破坏"就是一张图"的观感；无门店则不显示。

## 2. 隐藏"未命名素材"

- `src/api/assets.ts`：`title` 兜底从 `"未命名素材"` 改为 `""`（空串）。
- 预览弹窗 `DialogTitle`：title 为空时只展示来源徽标，不再渲染空标题。
- 标签管理弹窗里基于 title 搜索的逻辑不受影响（搜索还在 `tags + title`，title 为空不参与匹配）。

## 3. 预览 / 播放修复

当前点击没反应/视频不播，定位与修法：

- **点击不响应**：右下角的 `<span role="button">` 发布入口虽然 `stopPropagation`，但在 `opacity-0` 时仍占位（绝对定位 7×7），覆盖了图片右下角的点击。改为：未 hover 时加 `pointer-events-none`，hover 后才接收点击。这样整张图任何位置点击都会触发 `setPreview(a)`。
- **大图不显示 / 视频不播**：
  - 大图当前用了 `thumb()` 处理过的缩略图作为 `<img src>`？检查代码：预览用的是 `preview.outputUrl`（原图），缩略图才用 `thumbnailUrl`。OK，逻辑没问题，但原图 URL 可能是私有 bucket 或被 CORS 拦截。增加 `onError` 回退到 `thumbnailUrl`，并显示"无法加载，点此在新窗口打开"链接（`target="_blank"`），让用户起码能看到。
  - 视频 `<video>` 加 `playsInline`、`preload="metadata"`、`controls`，去掉 `autoPlay`（很多浏览器会因为带声音的 autoplay 被拦截，表现就是"不播"）。同样 `onError` 回退到"在新窗口打开"链接。
- Dialog 内容器去掉 `overflow-hidden`，避免 max-h 截掉控件。

## 验收

- 网格里每张卡 = 一张正方形图，没有底部文字栏，也没有"未命名素材"占位。
- 任意位置点击图片 → 弹出大图；视频 → 出现播放控件，点播放能播。
- 来源/类型/搜索/分页/发布按钮 全部照旧。
