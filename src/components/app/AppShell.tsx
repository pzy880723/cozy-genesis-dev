import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ImagePlay,
  Sparkles,
  Send,
  KeyRound,
  Settings,
  Search,
  Bell,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Command as CommandIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "工作台", icon: LayoutDashboard },
  { to: "/aigc", label: "AI 创作中心", icon: Sparkles },
  { to: "/assets", label: "素材库", icon: ImagePlay },
  { to: "/publish", label: "发布中心", icon: Send },
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
  "/accounts": "账号管理",
  "/settings": "系统设置",
};

const KICKER: Record<string, string> = {
  "/": "HOME / OVERVIEW",
  "/aigc": "AIGC / STUDIO",
  "/aigc/video": "AIGC / VIDEO",
  "/aigc/image": "AIGC / IMAGE",
  "/aigc/copy": "AIGC / COPY",
  "/aigc/oneclick": "AIGC / ONE-CLICK",
  "/assets": "LIBRARY / ASSETS",
  "/publish": "DISTRIBUTION / PUBLISH",
  "/accounts": "ACCESS / ACCOUNTS",
  "/settings": "SYSTEM / SETTINGS",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = TITLES[pathname] ?? "BOOMER.OFF";
  const kicker = KICKER[pathname] ?? "BOOMER.OFF / AIGC";

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("boomer.sidebar.collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem("boomer.sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div
      className={cn(
        "grid min-h-screen min-w-[1180px] bg-background text-foreground transition-[grid-template-columns] duration-200",
        collapsed ? "grid-cols-[56px_1fr]" : "grid-cols-[220px_1fr]",
      )}
    >
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground py-3">
        <Link to="/" className={cn("mb-4 flex items-center gap-2 px-3", collapsed && "justify-center px-0")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <span className="text-[13px] font-black">B.</span>
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display text-[15px] tracking-wide text-white">BOOMER.OFF</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">AIGC Studio</div>
            </div>
          )}
        </Link>
        <nav className="grid gap-0.5 px-2">
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
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white",
                  collapsed && "justify-center px-0",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 h-6 w-[2px] rounded-r bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="mb-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-sm text-[11px] font-semibold text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-white"
            title={collapsed ? "展开侧栏" : "折叠侧栏"}
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : (<><PanelLeftClose className="h-3.5 w-3.5" /> 折叠</>)}
          </button>
          {!collapsed && (
            <div className="rounded-sm border border-sidebar-border/60 bg-sidebar-accent/40 p-2.5 text-[10px] leading-relaxed text-sidebar-foreground/60">
              <div className="font-display text-[13px] text-white">v1.0 · Mock</div>
              <div className="mt-0.5">前端 Mock · 后端对齐中</div>
              <div className="mt-1.5 flex items-center gap-1 text-sidebar-foreground/50">
                <kbd className="rounded border border-sidebar-border/80 px-1 font-mono">⌘K</kbd>
                <span>全局命令</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-col bg-background">
        <header className="flex h-12 items-center justify-between gap-4 border-b border-border bg-card/60 px-6 backdrop-blur">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="kicker hidden md:inline">{kicker}</span>
            <span className="hidden h-3 w-px bg-border md:inline-block" />
            <h1 className="truncate font-display text-[20px] leading-none text-foreground">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="group flex h-8 w-[260px] items-center gap-2 rounded-sm border border-border bg-background px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">搜索素材、任务、账号、门店</span>
              <kbd className="flex h-5 items-center gap-0.5 rounded-sm border border-border bg-secondary px-1 font-mono text-[10px] text-muted-foreground">
                <CommandIcon className="h-2.5 w-2.5" />K
              </kbd>
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-[12px] font-semibold text-foreground hover:border-foreground/30">
              全部门店
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            <button className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-card text-charcoal-2 hover:border-foreground/30 hover:text-foreground">
              <Bell className="h-3.5 w-3.5" />
            </button>
            <div className="flex h-8 items-center gap-2 rounded-sm border border-border bg-card pl-1 pr-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-primary text-[10px] font-black text-primary-foreground">
                MK
              </div>
              <span className="text-[12px] font-semibold">市场部</span>
            </div>
          </div>
        </header>
        <div className="min-w-0 flex-1 px-7 py-6">{children}</div>
      </main>
    </div>
  );
}