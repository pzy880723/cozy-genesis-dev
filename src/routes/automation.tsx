import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { StatusBadge, jobStatusLabel, jobStatusTone } from "@/components/app/StatusBadge";
import { PlatformBadge } from "@/components/app/PlatformBadge";
import { automationApi } from "@/api/automation";
import { shopsApi } from "@/api/shops";
import { Plus, Play, Pause, X, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationTask, Platform } from "@/types";

export const Route = createFileRoute("/automation")({
  head: () => ({ meta: [{ title: "自动化任务 · BOOMER.OFF AIGC" }] }),
  component: AutomationPage,
});

function AutomationPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "enabled" | "paused" | "error">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tasks = useQuery({ queryKey: ["automations"], queryFn: () => automationApi.list() });
  const data = (tasks.data ?? []).filter((t) => (filter === "all" ? true : t.status === filter));

  const toggle = async (t: AutomationTask) => {
    await automationApi.update(t.id, { status: t.status === "enabled" ? "paused" : "enabled" });
    qc.setQueryData<AutomationTask[]>(["automations"], (prev) =>
      (prev ?? []).map((x) =>
        x.id === t.id ? { ...x, status: x.status === "enabled" ? "paused" : "enabled" } : x,
      ),
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="自动化任务"
        description="每天定时选素材、生成内容、自动发布到所有平台。"
        actions={
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> 新建自动化任务
          </button>
        }
      />

      <div className="mb-3.5 flex h-10 items-center gap-1 rounded-md border border-border bg-white p-1">
        {[
          { k: "all", n: "全部" },
          { k: "enabled", n: "运行中" },
          { k: "paused", n: "暂停" },
          { k: "error", n: "异常" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k as typeof filter)}
            className={cn(
              "h-8 rounded px-3 text-xs font-bold",
              filter === t.k ? "bg-primary-soft text-primary" : "text-graphite hover:bg-secondary",
            )}
          >
            {t.n}
          </button>
        ))}
      </div>

      <Panel title="任务列表" hint={`共 ${data.length} 条`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#fafafa] text-left text-xs text-muted-foreground">
              <th className="h-11 px-4 font-semibold">任务名称</th>
              <th className="h-11 px-4 font-semibold">范围</th>
              <th className="h-11 px-4 font-semibold">执行时间</th>
              <th className="h-11 px-4 font-semibold">内容策略</th>
              <th className="h-11 px-4 font-semibold">平台</th>
              <th className="h-11 px-4 font-semibold">状态</th>
              <th className="h-11 px-4 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id} className="border-b border-[#f0f0f1] last:border-b-0">
                <td className="h-14 px-4">
                  <div className="font-bold">{t.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">下次：{t.nextRunAt}</div>
                </td>
                <td className="h-14 px-4 text-graphite">{t.shopNames?.join("、")}</td>
                <td className="h-14 px-4 text-graphite">{t.runTimes.join(" / ")}</td>
                <td className="h-14 px-4 text-graphite">{t.contentStrategy}</td>
                <td className="h-14 px-4">
                  <div className="flex flex-wrap gap-1">
                    {t.platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                  </div>
                </td>
                <td className="h-14 px-4">
                  <StatusBadge tone={jobStatusTone(t.status)}>{jobStatusLabel(t.status)}</StatusBadge>
                </td>
                <td className="h-14 px-4">
                  <div className="flex items-center gap-1">
                    <IconAction onClick={() => automationApi.runNow(t.id)} icon={Play} label="立即执行" />
                    <IconAction onClick={() => toggle(t)} icon={t.status === "enabled" ? Pause : Play} label={t.status === "enabled" ? "暂停" : "启用"} />
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7}>
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <ZapOff className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-bold">当前筛选下没有任务</p>
                  <p className="mt-1 text-xs text-muted-foreground">切换筛选条件，或新建一个自动化任务。</p>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </Panel>

      {drawerOpen && <NewTaskDrawer onClose={() => setDrawerOpen(false)} />}
    </AppShell>
  );
}

function IconAction({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="inline-flex h-8 items-center gap-1 rounded border border-border bg-white px-2 text-xs font-bold text-graphite hover:bg-secondary"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function NewTaskDrawer({ onClose }: { onClose: () => void }) {
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const [name, setName] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(["xhs", "douyin", "wechat_channels", "kuaishou"]);

  const toggleP = (p: Platform) =>
    setPlatforms((arr) => (arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="flex h-full w-[480px] flex-col border-l border-border bg-white">
        <header className="flex h-14 items-center justify-between border-b border-border px-5">
          <strong className="text-base font-black">新建自动化任务</strong>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-auto p-5 text-sm">
          <Field label="任务名称">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：总部每日内容"
              className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="任务归属">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>总部品牌</option>
              <option>单个门店</option>
              <option>多个门店</option>
            </select>
          </Field>
          <Field label="门店">
            <div className="flex flex-wrap gap-2">
              {(shops.data ?? []).map((s) => (
                <span key={s.id} className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-graphite">
                  {s.name}
                </span>
              ))}
            </div>
          </Field>
          <Field label="素材来源">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>智能从素材库挑选</option>
              <option>仅 AI 生成</option>
              <option>仅门店上传</option>
            </select>
          </Field>
          <Field label="内容类型">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>图文</option>
              <option>短视频</option>
              <option>纯文案</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="每日数量">
              <input type="number" defaultValue={3} className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm" />
            </Field>
            <Field label="执行时间">
              <input type="time" defaultValue="10:00" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm" />
            </Field>
          </div>
          <Field label="发布平台（默认全选）">
            <div className="grid grid-cols-4 gap-2">
              {(["xhs", "wechat_channels", "douyin", "kuaishou"] as Platform[]).map((p) => {
                const on = platforms.includes(p);
                const label = { xhs: "小红书", wechat_channels: "视频号", douyin: "抖音", kuaishou: "快手" }[p];
                return (
                  <button
                    key={p}
                    onClick={() => toggleP(p)}
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
          <Field label="失败处理策略">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>自动重试 1 次</option>
              <option>暂停任务</option>
              <option>通知运营</option>
            </select>
          </Field>
        </div>
        <footer className="flex h-14 items-center justify-end gap-2 border-t border-border px-5">
          <button onClick={onClose} className="h-9 rounded-md border border-border bg-white px-4 text-sm font-bold hover:bg-secondary">取消</button>
          <button
            onClick={async () => {
              await automationApi.create({ name, platforms });
              onClose();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-95"
          >
            创建并启用
          </button>
        </footer>
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