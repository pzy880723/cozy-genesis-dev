
# BOOMER 帮我拍 · 全局修改方案

读完 `BOOMER-OFF-品牌完整介绍.md` 后做的三件事：
1. 把「部门帮我拍」全部改名「BOOMER 帮我拍」
2. 视频类型由多选改单选
3. 倾向品类按品牌文档第十二节铺齐，并把品牌资料、铁律、视觉风格、必拍镜头沉淀进系统，作为 AI 一键出片的"设计依据"

---

## 一、命名与入口

- 入口卡（`aigc.index.tsx`）：标题 **BOOMER 帮我拍**，副标题「选店铺 → 选类型 → 一键 15 秒成片，脚本、角色都按 BOOMER·OFF 品牌铁律生成」
- `/aigc/video` 顶部提示条：「想更快？试试 BOOMER 帮我拍 →」
- `aigc.oneclick.tsx` 页头标题、面包屑、按钮文案全部替换为「BOOMER 帮我拍」
- 提交按钮文案：`✨ 一键生成 15s 成片`

> 路由路径仍保留 `/aigc/oneclick`（仅展示文案变更，避免改路由/外链）。

---

## 二、视频类型：多选 → 单选

`src/api/brand.ts` 的 `ONECLICK_VIDEO_TYPES` 收敛到品牌文档第十节"四类必做"，与脚本生成 vtype 对齐：

```text
⦿ 探店 store_tour          ← 主推，默认
○ 产品展示 product_showcase
○ 店铺氛围 store_ambience
○ 新品上架 new_arrival
```

- 组件用 `RadioGroup`，state 由 `OneClickVideoType[]` 改为 `OneClickVideoType`
- 至少 1 个的校验逻辑删除（单选必有值，默认 `store_tour`）
- `pickAutoAssets` / `oneClickGenerate` / `brandHighlight` 入参 `types: OneClickVideoType[]` 改为 `type: OneClickVideoType`
- `TYPE_TAG_HINTS` 同步加上 `product_showcase` 关键词（正面/细节/微距/上身）

---

## 三、倾向品类：按品牌文档第十二节铺齐

文档第十二节列出 7 大类，作为全店通用的「品类池」，店铺 `categories` 是其子集。

`brand.ts` 新增常量：

```text
BOOMER_CATEGORY_POOL = [
  "全品类",
  "日本中古瓷器",
  "趣味玩具",
  "IP 玩偶",
  "黑胶唱片",
  "中古数码",
  "中古杂货",
  "欧洲中古小物",
]
```

UI（Step 03）：
- 来源 = 当前店铺 `categories` ∪ `BOOMER_CATEGORY_POOL`，加「全品类」置首
- 单选 chip，默认值：店铺 `primaryCategory`，否则「全品类」
- 文案：「想偏向哪一类？AI 会优先取该品类的素材并往脚本里带。」

---

## 四、品牌资料对齐 BOOMER·OFF（删掉"瓷器天堂/玩具天堂"假数据）

`brand.ts` 的 `PROFILES` 重写为品牌文档里真实存在的店铺：

| shopId | brandName | brandIntro 摘要 | brandTone | categories | primaryCategory |
| --- | --- | --- | --- | --- | --- |
| `shop_zxth` | BOOMER·OFF · 上海中信泰富店 | 南京西路 B1 旗舰，无门面通透铺位，日欧中古杂货寻宝乐园，6.9 元起 | 克制 · 有质感 · 像随手记 | 日本中古瓷器 / 趣味玩具 / IP 玩偶 / 黑胶唱片 / 中古数码 / 中古杂货 / 欧洲中古小物 | 日本中古瓷器 |
| `shop_mh728` | BOOMER·OFF · 闵行 728 总部 | 总部及货品中转中心（非零售），用于内容/培训素材 | 克制 · 内部 | 全品类 | — |
| `hq` | BOOMER·OFF（总部） | 国内首家标准化中古连锁，30,000+ SKU、6.9 元起、平价中古杂货铺 | 克制 · 有质感 · 像随手记 | 全品类 | — |

> 删除原 mock 里的 `南京新街口` `静安店` 与潮牌口径，以及 `瓷器天堂` / `玩具天堂` 这两条与品牌不符的资料。

`brandHighlight()` 在原拼装基础上**注入品牌铁律**，让脚本生成端默认守规：

```text
【品牌】BOOMER·OFF（标准化中古连锁）
【语调】克制、有质感、像随手记
【品牌介绍】… (来自 brandIntro)
【本片类型】探店
【倾向品类】日本中古瓷器
【内容铁律】100% 简体中文；不编造价格/年代/产地/品牌/材质；
  禁词：主播/直播间/保真/秒杀/全网最低/拍卖行级别/独家供应商；
  称呼：你 / 您 / 店员；不用"宝宝们/家人们"；不喊话、不带货式叫卖。
【视觉风格】真人写实纪实风；暖光/电影级三点布光；中焦+微距；胶片颗粒。
【硬约束】商场内门店，无门框、无户外；探店类首镜必须是门头。
```

---

## 五、自动选图规则细化

`pickAutoAssets`：
- 维持 `source==='upload'` 硬过滤、最多 9 张
- 探店类（`store_tour`）首位强制塞「门头/招牌/门店入口」标签的图（命中 `门头/招牌/入口/BOOMER` 关键字），与文档"门头必为第一镜"对齐；命中不到则面板顶部出现提示「未找到门头图，建议补拍后再生成」
- `TYPE_TAG_HINTS` 调整为品牌词：探店→门头/货架/翻筐/陈列；产品展示→正面/细节/微距；店铺氛围→暖光/霓虹/空镜；新品上架→新到/标签/多角度

---

## 六、设置区与文案

- 模型：⦿ Fast（默认） ○ PRO
- 画幅：⦿ 9:16  ○ 1:1  ○ 16:9（默认 9:16，对齐抖音/小红书/视频号主流量）
- 时长：固定 15s（保留说明「CDS 单段上限」）
- 顶部展示「品牌资料预览卡」：brandName / brandTone / brandIntro 前两行 [展开]，底部小字：「AI 会按 BOOMER·OFF 品牌铁律设计画面、旁白与角色」

---

## 七、改动清单

- 修改：`src/api/brand.ts`
  - `ONECLICK_VIDEO_TYPES` 改为 4 项；新增 `BOOMER_CATEGORY_POOL`
  - `OneClickVideoType` 单值化；`brandHighlight(profile, type, category)` 签名调整 + 注入铁律段
  - `PROFILES` 按 BOOMER·OFF 真实门店重写，删除瓷器/玩具天堂
  - 新增 `buildCategoryOptions(profile)` = 池 ∪ 店铺 categories，去重置「全品类」置首
- 修改：`src/api/aigc.ts`
  - `OneClickPickInput.types` → `type`；`OneClickGenerateInput.types` → `type`
  - `pickAutoAssets`：单类型评分 + 门头优先
  - `oneClickGenerate`：briefDigest/highlight 用单类型
  - `TYPE_TAG_HINTS` 关键词替换
- 修改：`src/routes/_authenticated/aigc.oneclick.tsx`
  - 全文案改「BOOMER 帮我拍」
  - Step 02 改 `RadioGroup` 单选
  - Step 03 用 `buildCategoryOptions`
  - 移除多选校验
- 修改：`src/routes/_authenticated/aigc.index.tsx`：入口卡标题/副标题/icon
- 修改：`src/routes/_authenticated/aigc.video.tsx`：顶部提示条改名

> 不动：路由路径、`generateVideoScript` 接口签名、`pollRenderJob`、UI 组件库。

---

## 八、验收

1. 入口卡显示「BOOMER 帮我拍」，旧"部门帮我拍"全站搜索 0 命中
2. 视频类型为 4 选 1 单选，默认「探店」
3. 倾向品类下拉包含 BOOMER 7 大类 + 「全品类」+ 店铺自有 categories（去重）
4. 切换到「上海中信泰富店」时品牌资料卡显示真实 BOOMER·OFF 文案
5. 探店类一键挑图后，第一张是门头/招牌图；没有时顶部出现补拍提示
6. 生成出的脚本旁白不含禁词（主播 / 宝宝们 / 全网最低 / 秒杀 …），首镜为门头
