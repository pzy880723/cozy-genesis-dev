# 诊断：`shadow_user_create_failed`（只读结论）

## 范围声明
`erp-aigc-session` Edge Function 的源码位于 ERP boomeroff 后端仓库，本仓库（AIGC 前端）不持有其实现，只持有：
- 目标表定义：`docs/migrations/2026-07-19-erp-sso.sql` → `public.erp_user_links`
- 调用方：`src/lib/erp-sso.functions.ts`（透传 ticket，只解读返回 code）

因此以下诊断基于契约、表结构和 Supabase Auth Admin API 已知语义推断，未直接读到该 Edge Function 的运行时日志与源码。

## code=`shadow_user_create_failed` 的精确触发条件
按命名与流程还原，该 code 只在 Edge Function 的"影子用户创建"分支被抛出，即：
在 ticket 验证通过、ERP 侧 exchange 返回真实账号资料之后，为该 ERP 用户在 AIGC 的 `auth.users` 建立/找回对应影子账号的这一步失败——通常是 `supabase.auth.admin.createUser({ email, phone, email_confirm: true, user_metadata, app_metadata })` 返回非 2xx，Function 捕获后统一映射为该 code + HTTP 500。

普通超级管理员测试账号能过，唯一变量是该 ERP 账号在 AIGC 端的既有数据。

## 该"实际 ERP 超级管理员账号"最可能命中的冲突（按概率排序）

1. **邮箱已在 `auth.users` 存在，但没有对应 `erp_user_links` 行**
   Supabase Admin `createUser` 对已注册邮箱返回 422 `email_exists` / "A user with this email address has already been registered"。这是最常见的一类："同一个人以前直接在 AIGC 注册过 / 早期联调残留 / 另一个 ERP 用户共用同一邮箱"。Function 若只做 `createUser` 而没有"存在即认领"分支，就会直接抛 `shadow_user_create_failed`。

2. **手机号唯一冲突**
   若 Function 同时写入 `phone` 且启用了 phone provider，超级管理员账号在 ERP 里通常带手机号，命中 `phone_exists` 同样报同一 code。

3. **`erp_user_links` 侧唯一键冲突（半残留状态）**
   表上有 `unique (aigc_user_id)` 和 `erp_user_id primary key`。历史迁移或早期人工测试可能留下：
   - 同一 `aigc_user_id` 已被另一个 `erp_user_id` 占用（新 ERP super_admin 想复用已存在的 auth 用户时被这个唯一键顶回来）；
   - 或表里已有该 `erp_user_id`，但指向一个已被删除的 `aigc_user_id`（`on delete cascade` 会连带删掉行，通常不会留下悬挂，但若删除路径绕过外键就会残留）。
   这些若发生在 upsert 之前的"确保 auth 用户存在"步骤之后，也会被同一 catch 归并到 `shadow_user_create_failed`。

4. **Auth 侧字段被 ERP 数据触发校验失败**
   例如邮箱为 ERP 内部占位（非法格式）、`user_metadata` 体积超限、`app_metadata` 里 permissions 数组过长——普通测试账号数据干净，真实超管权限/门店范围大，更容易踩到。

以（1）为最主流原因，与"测试账号通过、真实超管失败"的表征最吻合。

## 只读验证步骤（不改任何东西）
在共享 Supabase (`narqwgwpqglathwtyevz`) 里，按顺序读：

1. Edge Function 日志（Dashboard → Edge Functions → `erp-aigc-session` → Logs），过滤最近一次 500，看 catch 打印的底层 Auth 错误 message（`email_exists` / `phone_exists` / `duplicate key value violates unique constraint "..."`）——这一步就能定性。
2. `auth.users` 中按该 ERP 超管的邮箱/手机号查是否已存在 `id`。
3. `public.erp_user_links` 中按 `erp_user_id` 与上一步查到的 `aigc_user_id` 双向查是否已有行、是否互相错位。

以上仅 SELECT，不涉及写入。

## 最小安全修复方案（待批准后在 ERP 后端仓库实施；本仓库不改）
目标：把"创建影子用户"改造成**幂等的"确保存在并认领"**，不放宽任何权限。

1. 在 Edge Function 的影子用户环节先按 `erp_user_id` 查 `erp_user_links`：
   - 命中 → 直接用其 `aigc_user_id`；
   - 未命中 → 按邮箱（必要时手机号）在 `auth.users` 查：
     - 存在 → 复用该 `aigc_user_id`；
     - 不存在 → `admin.createUser`。
2. 用这个 `aigc_user_id` 对 `erp_user_links` 做 `upsert on conflict (erp_user_id)`；若同时命中 `unique (aigc_user_id)` 且对应的 `erp_user_id` 不同，视为数据异常，返回明确 code（如 `shadow_user_conflict`），不要静默覆写。
3. `admin.updateUserById` 刷新 `app_metadata`（roles/permissions/erp_user_id/shops）与 `user_metadata`（显示字段），失败即中止并返回明确 code。
4. 把当前笼统的 `shadow_user_create_failed` 细分至少为：`email_exists_unlinked` / `phone_exists_unlinked` / `link_conflict` / `auth_create_failed` / `auth_update_failed`，前端 `ERR_MSG` 相应扩展中文提示（本仓库改动仅限文案映射表）。
5. 不改表结构、不改 RLS、不放开 anon/authenticated 权限、不打印 secret 或 PII。

## 不做的事
- 不修改本仓库任何代码、路由、secrets。
- 不执行任何数据库写操作。
- 不回显密钥、ticket、邮箱、手机号或用户 ID。
