import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ImagePlay,
  Sparkles,
  Send,
  Bot,
  KeyRound,
  Settings,
  Search,
  Bell,
  ChevronDown,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "工作台", icon: LayoutDashboard },
  { to: "/aigc", label: "AI 创作中心", icon: Sparkles },
  { to: "/assets", label: "素材库", icon: ImagePlay },
  { to: "/publish", label: "发布中心", icon: Send },
  { to: "/automation", label: "自动化任务", icon: Bot },
  { to: "/accounts", label: "账号管理", icon: KeyRound },
  { to: "/settings", label: "系统设置", icon: Settings },
] as const;

const TITLES: Record<string, string> = {
  "/": "工作台",
  "/assets": "素材库",
  "/aigc": "AI 创作中心",
  "/aigc/video": "AI 短视频生成",
  "/aigc/image": "AI 图片",
  "/aigc/copy": "AI 文案",
  "/publish": "发布中心",
  "/automation": "自动化任务",
  "/accounts": "账号管理",
  "/settings": "系统设置",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = TITLES[pathname] ?? "BOOMER.OFF";

  return (
    <div className="grid min-h-screen min-w-[1280px] grid-cols-[240px_1fr] bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-border bg-secondary px-3.5 py-5">
        <Link to="/" className="mb-7 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-black">B.</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-wide">BOOMER.OFF</div>
            <div className="text-[11px] font-semibold text-muted-foreground">AIGC 营销中台</div>
          </div>
        </Link>
        <nav className="grid gap-1">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-bold transition-colors",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-graphite hover:bg-white",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 h-7 w-[3px] rounded-r bg-primary" />
                )}
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-md border border-border bg-white p-3 text-[11px] text-muted-foreground">
          <div className="font-semibold text-foreground">v1.0 · Mock 模式</div>
          <div className="mt-1">所有数据来自前端 Mock，后端接口对齐中。</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-col bg-background">
        <header className="flex h-16 items-center justify-between border-b border-border px-7">
          <h1 className="text-[18px] font-black">{title}</h1>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-[320px] items-center gap-2 rounded-md border border-border bg-[#fafafa] px-3 text-xs font-medium text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span>搜索素材、任务、账号、门店</span>
            </div>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-bold text-foreground hover:bg-secondary">
              全部门店
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-graphite hover:bg-secondary">
              <Bell className="h-4 w-4" />
            </button>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-white px-2 pl-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-black text-primary-foreground">
                MK
              </div>
              <span className="text-xs font-bold">市场部 · 默认</span>
            </div>
          </div>
        </header>
        <div className="min-w-0 flex-1 px-7 py-6">{children}</div>
      </main>
    </div>
  );
}