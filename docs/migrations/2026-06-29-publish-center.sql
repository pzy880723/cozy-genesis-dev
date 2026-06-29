-- 发布中心接通真库需要的 schema 改动
-- 在共享 Supabase 项目 (ref: narqwgwpqglathwtyevz) 执行
-- 执行后请重新生成并粘贴 src/integrations/shared-db/types.ts

-- 1. automation_tasks
CREATE TABLE IF NOT EXISTS public.automation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('hq','store','multi_store')),
  shop_ids uuid[] NOT NULL DEFAULT '{}',
  content_kind text NOT NULL DEFAULT 'image_text',
  asset_source text NOT NULL DEFAULT 'mixed',
  content_strategy text,
  platforms text[] NOT NULL DEFAULT ARRAY['xhs','wechat_channels','douyin','kuaishou'],
  daily_limit int NOT NULL DEFAULT 1,
  run_times text[] NOT NULL DEFAULT ARRAY['10:00'],
  failure_policy text NOT NULL DEFAULT 'retry_once',
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','paused','error')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_tasks TO authenticated;
GRANT ALL ON public.automation_tasks TO service_role;

ALTER TABLE public.automation_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read" ON public.automation_tasks;
CREATE POLICY "authenticated read" ON public.automation_tasks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated write" ON public.automation_tasks;
CREATE POLICY "authenticated write" ON public.automation_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. social_publish_targets 补 Phase 2 列（Worker 契约 §1.2）
ALTER TABLE public.social_publish_targets
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;