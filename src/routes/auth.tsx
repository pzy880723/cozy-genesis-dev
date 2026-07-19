import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/shared-db/client";
import { ArrowRight, Building2 } from "lucide-react";
import { normalizeInternalRedirect } from "@/lib/erp-sso-contract";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    from: normalizeInternalRedirect(typeof s.from === "string" ? s.from : "/"),
  }),
  head: () => ({
    meta: [
      { title: "企业统一登录 · BOOMER.OFF AI 营销中心" },
      { name: "description", content: "使用 ERP 企业账号统一登录 BOOMER.OFF AI 营销中心" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuthPage,
});

// ERP 生产入口；如需切换到 preview，只改这一处。
const ERP_LOGIN_URL = "https://boomer-off-buddy.lovable.app";

function AuthPage() {
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate({ to: from || "/", replace: true });
        return;
      }
      setChecked(true);
    })();
  }, [from, navigate]);

  if (!checked) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Building2 className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <div className="text-[10px] font-black tracking-[0.18em] text-primary">
              ENTERPRISE SSO
            </div>
            <h1 className="text-lg font-black text-foreground">BOOMER.OFF AI 营销中心</h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          本平台使用 <span className="font-black text-foreground">ERP 企业账号统一登录</span>，
          不再单独维护账号密码。请先在 ERP 登录，然后从侧栏「AI 营销中心」入口进入。
        </p>

        <a
          href={ERP_LOGIN_URL}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-black text-primary-foreground hover:bg-primary/90"
        >
          前往 ERP 登录 <ArrowRight className="h-4 w-4" />
        </a>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          遇到问题请联系管理员开通 AIGC 权限
        </p>
      </div>
    </div>
  );
}
