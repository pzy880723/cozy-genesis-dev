import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { StatusBadge, jobStatusLabel, jobStatusTone } from "@/components/app/StatusBadge";
import { PlatformBadge } from "@/components/app/PlatformBadge";
import { accountsApi } from "@/api/accounts";
import { shopsApi } from "@/api/shops";
import { QrCode, ScanLine, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "账号管理 · BOOMER.OFF AIGC" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const [activeOwner, setActiveOwner] = useState<string>("hq");
  const [bindOpen, setBindOpen] = useState(false);
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });

  const visible = useMemo(
    () => (accounts.data ?? []).filter((a) => a.ownerId === activeOwner),
    [accounts.data, activeOwner],
  );

  return (
    <AppShell>
      <PageHeader
        title="账号管理"
        description="总部账号与门店账号分组管理。账号失效时一键重新扫码。"
        actions={
          <button
            onClick={() => setBindOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:opacity-95"
          >
            <ScanLine className="h-4 w-4" /> 扫码绑定账号
          </button>
        }
      />

      <div className="grid grid-cols-[220px_1fr] gap-3.5">
        <Panel title="归属">
          <div className="p-2">
            {(shops.data ?? []).map((s) => {
              const count = (accounts.data ?? []).filter((a) => a.ownerId === s.id).length;
              const active = activeOwner === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveOwner(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold",
                    active ? "bg-primary-soft text-primary" : "text-graphite hover:bg-secondary",
                  )}
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="账号列表" hint={`共 ${visible.length} 个`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs text-muted-foreground">
                <th className="h-11 px-4 font-semibold">平台</th>
                <th className="h-11 px-4 font-semibold">自定义名称</th>
                <th className="h-11 px-4 font-semibold">状态</th>
                <th className="h-11 px-4 font-semibold">最近检测</th>
                <th className="h-11 px-4 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id} className="border-b border-[#f0f0f1] last:border-b-0">
                  <td className="h-12 px-4"><PlatformBadge platform={a.platform} /></td>
                  <td className="h-12 px-4 font-bold">{a.displayName}</td>
                  <td className="h-12 px-4">
                    <StatusBadge tone={jobStatusTone(a.status)}>{jobStatusLabel(a.status)}</StatusBadge>
                  </td>
                  <td className="h-12 px-4 text-muted-foreground">{a.lastCheckedAt}</td>
                  <td className="h-12 px-4">
                    {a.status === "expired" ? (
                      <button className="inline-flex h-7 items-center gap-1 rounded border border-primary px-2 text-xs font-bold text-primary hover:bg-primary-soft">
                        <ScanLine className="h-3 w-3" /> 重新扫码
                      </button>
                    ) : (
                      <button className="text-xs font-bold text-graphite hover:underline">查看 / 重命名</button>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={5}>
                  <div className="px-6 py-12 text-center">
                    <p className="text-sm font-bold">该归属下还没有账号</p>
                    <p className="mt-1 text-xs text-muted-foreground">点击右上角“扫码绑定账号”添加。</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      {bindOpen && <BindDrawer onClose={() => setBindOpen(false)} defaultOwner={activeOwner} />}
    </AppShell>
  );
}

function BindDrawer({ onClose, defaultOwner }: { onClose: () => void; defaultOwner: string }) {
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const [owner, setOwner] = useState(defaultOwner);
  const [platform, setPlatform] = useState<Platform>("xhs");
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<"form" | "scanning" | "done">("form");

  const handleStart = async () => {
    await accountsApi.startLogin({ ownerId: owner, platform, displayName: name });
    setPhase("scanning");
    setTimeout(() => setPhase("done"), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="flex h-full w-[440px] flex-col border-l border-border bg-white">
        <header className="flex h-14 items-center justify-between border-b border-border px-5">
          <strong className="text-base font-black">扫码绑定账号</strong>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-auto p-5">
          {phase === "form" && (
            <>
              <Field label="账号归属">
                <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                  {(shops.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="平台">
                <div className="grid grid-cols-4 gap-2">
                  {(["xhs", "wechat_channels", "douyin", "kuaishou"] as Platform[]).map((p) => {
                    const on = platform === p;
                    const label = { xhs: "小红书", wechat_channels: "视频号", douyin: "抖音", kuaishou: "快手" }[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setPlatform(p)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-xs font-bold",
                          on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="自定义名称">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：总部小红书主号"
                  className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
                />
              </Field>
              <button
                disabled={!name}
                onClick={handleStart}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-95 disabled:opacity-50"
              >
                <QrCode className="h-4 w-4" /> 生成二维码
              </button>
            </>
          )}
          {phase === "scanning" && (
            <div className="flex flex-col items-center py-6">
              <div className="flex h-52 w-52 items-center justify-center rounded-md border border-border bg-secondary">
                <QrCode className="h-24 w-24 text-graphite" />
              </div>
              <p className="mt-4 text-sm font-bold">请使用对应 App 扫码登录</p>
              <p className="mt-1 text-xs text-muted-foreground">登录后 Cookie 将由系统安全保存，无需用户操作。</p>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> 等待扫码…
              </div>
            </div>
          )}
          {phase === "done" && (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_15%,white)] text-[var(--success)]">
                <Check className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold">绑定成功</p>
              <p className="mt-1 text-xs text-muted-foreground">账号已加入列表，可在发布中心使用。</p>
              <button onClick={onClose} className="mt-5 h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">完成</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold text-graphite">{label}</div>
      {children}
    </div>
  );
}