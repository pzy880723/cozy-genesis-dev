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

-- 3. social_publish_jobs 关联回自动化任务
ALTER TABLE public.social_publish_jobs
  ADD COLUMN IF NOT EXISTS automation_task_id uuid REFERENCES public.automation_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_automation_task_created
  ON public.social_publish_jobs(automation_task_id, created_at DESC)
  WHERE automation_task_id IS NOT NULL;

-- 4. Worker 领单热路径索引
CREATE INDEX IF NOT EXISTS idx_social_publish_targets_pending_created
  ON public.social_publish_targets(created_at)
  WHERE status = 'pending';

-- 5. target 状态变化时自动汇总到 job
CREATE OR REPLACE FUNCTION public._summarize_publish_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job uuid := COALESCE(NEW.job_id, OLD.job_id);
  v_total int;
  v_done int;
  v_failed int;
  v_running int;
  v_new_status text;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'success'),
    count(*) FILTER (WHERE status IN ('failed','cancelled')),
    count(*) FILTER (WHERE status IN ('claimed','running'))
  INTO v_total, v_done, v_failed, v_running
  FROM public.social_publish_targets WHERE job_id = v_job;

  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  ELSIF v_done + v_failed = v_total THEN
    IF v_failed = 0 THEN v_new_status := 'success';
    ELSIF v_done = 0 THEN v_new_status := 'failed';
    ELSE v_new_status := 'partial_success';
    END IF;
  ELSIF v_running > 0 OR v_done > 0 OR v_failed > 0 THEN
    v_new_status := 'running';
  ELSE
    v_new_status := 'queued';
  END IF;

  UPDATE public.social_publish_jobs
     SET status = v_new_status, updated_at = now()
   WHERE id = v_job
     AND status <> v_new_status
     AND status <> 'cancelled';

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_summarize_publish_job ON public.social_publish_targets;
CREATE TRIGGER trg_summarize_publish_job
AFTER INSERT OR UPDATE OF status ON public.social_publish_targets
FOR EACH ROW EXECUTE FUNCTION public._summarize_publish_job();