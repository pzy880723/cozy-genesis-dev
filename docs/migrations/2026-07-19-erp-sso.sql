-- 2026-07-19 · ERP → AIGC SSO 影子用户映射
-- 目标数据库：AIGC 侧 shared Supabase (project ref: narqwgwpqglathwtyevz)
-- 在 Supabase Dashboard → SQL Editor 里整段执行（幂等）。

create table if not exists public.erp_user_links (
  erp_user_id uuid primary key,
  aigc_user_id uuid not null references auth.users(id) on delete cascade,
  phone text,
  display_name text,
  roles text[] not null default '{}',
  shops jsonb not null default '[]'::jsonb,
  last_login_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aigc_user_id)
);

create index if not exists erp_user_links_aigc_user_idx
  on public.erp_user_links (aigc_user_id);

alter table public.erp_user_links enable row level security;

-- 只有 service_role（服务端 admin 客户端）能读写；authenticated / anon 都不可见。
grant all on public.erp_user_links to service_role;

-- updated_at 触发器
create or replace function public.erp_user_links_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists erp_user_links_touch_updated_at on public.erp_user_links;
create trigger erp_user_links_touch_updated_at
  before update on public.erp_user_links
  for each row execute function public.erp_user_links_touch_updated_at();
