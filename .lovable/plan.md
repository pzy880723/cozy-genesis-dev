## 目标

让 PC 端生成的 AIGC 素材和手机端的素材在数据上区分开：
- 手机端生成 → 同步到 PC 素材库（保持现状）
- PC 端生成 → **只留在 PC 素材库**，手机 App 看不到
- PC 素材库顶部加一个「来源」筛选：全部 / 手机端 / PC 端，卡片上带角标

---

## 1) 数据库迁移（一次性）

在共享库 `marketing_assets` 加 `origin` 字段：

```sql
-- 1. 加枚举 + 列，默认 mobile（保护存量数据）
create type public.asset_origin as enum ('mobile', 'pc');

alter table public.marketing_assets
  add column origin public.asset_origin not null default 'mobile';

-- 2. 存量数据全部视为手机端来源
update public.marketing_assets set origin = 'mobile' where origin is null;

-- 3. 加索引（来源 + 创建时间，配合现有列表查询）
create index marketing_assets_origin_created_idx
  on public.marketing_assets (origin, created_at desc);

-- 4. RLS：手机端 App 只能看到 origin = 'mobile'
--    PC 端（本项目）能看到全部
--    需要根据现有 policy 调整，预计新增一条限制 mobile 客户端的策略，
--    或修改现有 SELECT policy 加上 origin 过滤。
```

> 关于「手机端完全看不到 PC 素材」：手机 App 的 Supabase 客户端用的是同一张表。最稳的做法是在 RLS SELECT policy 里加 `origin = 'mobile'` 的限制，前提是手机端和 PC 端能通过 JWT claim、apikey、或专用 service header 区分调用方。  
> **需要你确认**：手机端 App 是否走单独的 Supabase 角色/JWT？如果走的是同一个 anon/authenticated 角色无法在 RLS 层区分，那只能让手机端在它自己代码里加 `origin = 'mobile'` 过滤（这一步在 PC 项目里改不了）。我会按"PC 端写入时打 `origin = 'pc'`，并在迁移里给手机端预留一条 RLS 注释"来做，并在交付时提醒你去手机端项目加客户端过滤。

---

## 2) 后端写入逻辑（`src/api/assets.ts`）

- 所有 PC 端创建 / 上传素材的入口 → 强制写 `origin: 'pc'`。
- `assetsApi.list` 增加可选参数 `origin?: 'mobile' | 'pc' | 'all'`，默认 `all`。
- 类型层补 `Asset.origin` 字段，从 DB 直接透传。

---

## 3) 前端 UI（`src/routes/_authenticated/assets.tsx`）

- 顶部工具栏在「标签管理」按钮旁边加一个 **来源下拉**：全部 / 手机端 / PC 端，受控状态参与 `assetsApi.list` 的 query key，切换即重拉。
- 卡片右上角加来源小角标：
  - 📱 = 手机端
  - 💻 = PC 端
  - 半透明圆形底，避免遮挡 hover 出现的「放大 / 发布」图标。
- 预览 Dialog 里在标题旁也展示来源标签，方便确认。

---

## 4) 不动的部分

- 标签管理、缩略图压缩、分页"加载更多"、点击放大预览这些上一轮的改动全部保留。
- 不新建表，不动手机端代码。

---

## 需要你确认的一个点

手机端 App 现在是用哪种身份连 Supabase 的（同一个 anon key？独立用户登录？专用服务角色？），决定了"手机端看不到 PC 素材"是能在 PC 项目的 RLS 里一次搞定，还是必须配合手机端项目改客户端查询。如果你不确定，我会按"PC 写 origin=pc + 在迁移里写好 RLS 注释 + 交付时提醒你"的方式落地。