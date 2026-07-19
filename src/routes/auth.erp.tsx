import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/shared-db/client";
import { exchangeErpTicket } from "@/lib/erp-sso.functions";
import { Loader2, ShieldAlert, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth/erp")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    ticket: typeof s.ticket === "string" ? s.ticket : "",
    from: typeof s.from === "string" ? s.from : "/",
  }),
  head: () => ({
    meta: [
      { title: "ERP 单点登录 · BOOMER.OFF AI 营销中心" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ErpSsoPage,
});

function ErpSsoPage() {
  const { ticket, from } = Route.useSearch();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"verifying" | "error" | "no-ticket">(
    ticket ? "verifying" : "no-ticket",
  );
  const [errMsg, setErrMsg] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (!ticket || ran.current) return;
    ran.current = true;

    // 立即把 URL 里的 ticket 清掉，避免留在浏览器历史 / referer
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("ticket");
      window.history.replaceState({}, "", url.toString());
    } catch { /* noop */ }

    void (async () => {
      try {
        const res = await exchangeErpTicket({ data: { ticket } });
        if (!res.ok) {
          setErrMsg(res.error.message);
          setPhase("error");
          return;
        }
        const { error } = await supabase.auth.verifyOtp({
          email: res.email,
          token_hash: res.tokenHash,
          type: "magiclink",
        });
        if (error) {
          setErrMsg("AIGC 会话建立失败：" + error.message);
          setPhase("error");
          return;
        }
        // 建会话成功；跳转到目标页
        navigate({ to: from || "/", replace: true });
      } catch (e) {
        setErrMsg(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
  }, [ticket, from, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-black tracking-[0.18em] text-primary">
            SSO · ERP → AIGC
          </div>
          <h1 className="mt-2 text-xl font-black text-foreground">
            BOOMER.OFF AI 营销中心
          </h1>
        </div>

        {phase === "verifying" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              正在验证 ERP 身份并进入 AI 营销中心
            </p>
            <p className="text-xs text-muted-foreground">请稍候，通常只需 1–2 秒</p>
          </div>
        )}

        {phase === "no-ticket" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              没有检测到 ERP 登录票据，请从 ERP 侧栏「AI 营销中心」入口进入。
            </p>
            <a
              href={ErpLoginHref()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90"
            >
              前往 ERP 登录 <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <p className="text-center text-sm font-medium text-foreground">{errMsg}</p>
            <a
              href={ErpLoginHref()}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-black text-foreground hover:bg-accent"
            >
              回到 ERP 重新登录 <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ErpLoginHref(): string {
  // 前端不引用服务端 ERP_SSO_BASE_URL；直接指向 ERP 生产。
  return "https://boomer-off-buddy.lovable.app";
}