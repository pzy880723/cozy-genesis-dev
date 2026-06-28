## 目标

1. 左侧导航把「AI 创作中心」放到「素材库」上面。
2. 解释为什么"数据库已同步"但素材库还是空的——并把 **shops / assets** 这两页真正接到共享 Supabase 数据库（最小可见范围）。

---

## 为什么现在素材库还是空的（先说清楚）

接通的只是 **Supabase 客户端 + 登录 + 类型定义**，业务页面的数据层 `src/api/*.ts` **仍然全是 mock**。例如 `src/api/assets.ts` 现在还是 `await mock(mockAssets)`，`src/api/shops.ts` 也是 `mock(mockShops)`——它们根本没去查数据库，所以无论共享库里有多少素材，UI 看到的永远是 `src/mocks/data.ts` 里写死的几条假数据。

要看到对面项目的真实素材，必须把这两个 api 文件改成 `supabase.from('shops' / 'marketing_assets').select(...)`。这是之前规划里"Phase 5"的内容，现在你既然已经看到 anon key + types.ts 验证通过，可以开始。

---

## 本次改动

### 1) 导航顺序（`src/components/app/AppShell.tsx`）

`NAV` 数组里把 `aigc` 那行挪到 `assets` 之前。下方的 `pageTitles` 字典顺序也对应调一下（仅可读性，行为无影响）。

### 2) 接通 `shops`（`src/api/shops.ts`）

改写为：

```ts
const { data, error } = await supabase
  .from("shops")
  .select("id,name,active")
  .order("sort_order", { ascending: true });
```

共享库 `shops` 表没有 `type` 列，统一映射成 `type: "store"`（总部表 Phase 2 再处理）。删除 `mockShops` 依赖。

### 3) 接通 `assets`（`src/api/assets.ts`）

改写为查询 `marketing_assets`，按需带上 `shop_id` / `kind` 过滤、并联 `shops(name)` 拿门店名：

```ts
let q = supabase
  .from("marketing_assets")
  .select("id,shop_id,kind,category,tags,output_url,output_text,published_at,created_at,meta,shops(name)")
  .order("created_at", { ascending: false });
if (filters.shopId && filters.shopId !== "all") q = q.eq("shop_id", filters.shopId);
if (filters.kind && filters.kind !== "all") q = q.eq("kind", filters.kind);
```

字段映射（共享库 → 前端 `Asset` 类型）：

| 前端字段        | 来源                                                      |
| ----------- | ------------------------------------------------------- |
| `id`        | `id`                                                    |
| `shopId`    | `shop_id`                                               |
| `shopName`  | `shops.name`（join）                                      |
| `kind`      | `kind`                                                  |
| `title`     | `meta.title` ?? `output_text?.slice(0,30)` ?? `"未命名素材"` |
| `thumbnailUrl` | `output_url`（视频/图片都先用这个占位）                              |
| `outputUrl` | `output_url`                                            |
| `text`      | `output_text`                                           |
| `tags`      | `tags`                                                  |
| `category`  | `category`                                              |
| `source`    | `meta.source` ?? `"ai"`（共享库以 AI 为主）                     |
| `publishedAt` | `published_at`                                          |
| `createdAt` | `created_at`                                            |

`search`（标题/标签搜索）放在客户端过滤，避免 PostgREST `or` 语法在 tags 数组上不直观。

`AssetFilters.source` 仍保留，但共享库目前无明确 `upload/ai` 字段，先全部按 `meta.source` 软判断；不影响列表渲染。

### 4) 不动的

* `src/api/{aigc,accounts,automation,publish}.ts` 本轮不改，继续 mock，避免大面积白屏。
* mock 文件 `src/mocks/data.ts` 暂保留（`shops` 的下拉如果首次加载失败可临时降级，但本次实现里 shopsApi 不再读它，等下一轮全清）。
* RLS / 总部表 / Realtime / Worker 回调 等都按之前结论延后。

---

## 验证步骤（改完后你需要做的事）

1. 打开 `/auth`，用共享库里**确实有 marketing_assets 行**的账号登录。
2. 进入「素材库」页：
   * 如果共享库 `marketing_assets` 的 RLS 允许当前用户读到行，应能看到真实素材卡片；
   * 如果看到「当前筛选下暂无素材」但你确认数据存在，**99% 是 RLS 把你过滤掉了**——告诉我，我下一轮在共享库那边补 policy。
3. 顶部门店下拉应出现共享库 `shops` 表的真实门店名。

---

## 风险提示

* `marketing_assets` 的 RLS 你之前没让我动过。如果共享库那边的 SELECT policy 限定 `auth.uid() = user_id`，那 First Steps 这边登录的用户**只能看到自己创建的素材**，不是"全部"。验证时遇到空列表别急着说前端坏了，先看是不是 RLS。
* `shops` 表同理，如果没有 `TO authenticated USING (true)` 之类的 policy，下拉也会空。

确认就开干。