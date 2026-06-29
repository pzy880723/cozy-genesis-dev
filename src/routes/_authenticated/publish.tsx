import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/PageHeader";
import { StatusBadge, jobStatusLabel, jobStatusTone } from "@/components/app/StatusBadge";
import { PlatformBadge } from "@/components/app/PlatformBadge";
import { publishApi } from "@/api/publish";
import { assetsApi } from "@/api/assets";
import { shopsApi } from "@/api/shops";
import { automationApi } from "@/api/automation";
import { aigcApi, type GeneratedCopy } from "@/api/aigc";
import { Check, Sparkles, ChevronRight, Send, Plus, Play, Pause, X, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform, AutomationTask } from "@/types";

type Mode = "manual" | "auto";

export const Route = createFileRoute("/_authenticated/publish")({
  head: () => ({ meta: [{ title: "发布中心 · BOOMER.OFF AIGC" }] }),
  validateSearch: (s: Record<string, unknown>): { mode: Mode } => ({
    mode: s.mode === "auto" ? "auto" : "manual",
  }),
  component: PublishPage,
});

const PLATFORMS: { k: Platform; n: string; sub: string }[] = [
  { k: "xhs", n: "小红书", sub: "图文 / 视频" },
  { k: "wechat_channels", n: "视频号", sub: "视频优先" },
  { k: "douyin", n: "抖音", sub: "短视频" },
  { k: "kuaishou", n: "快手", sub: "短视频" },
];

function PublishPage() {
  const { mode } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setMode = (m: Mode) => navigate({ search: { mode: m } });
  return (
    <AppShell>
      <PageHeader
        title="发布中心"
        description={
          mode === "auto"
            ? "每天定时选素材、生成内容、自动发布到所有平台。"
            : "选素材 → 选范围 → AI 生成文案 → 一键发布到所有平台。"
        }
        actions={
          <div className="flex h-9 items-center overflow-hidden rounded-md border border-border bg-white">
            {[
              { k: "manual" as const, n: "手动发布" },
              { k: "auto" as const, n: "自动化任务" },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className={cn(
                  "h-full px-4 text-sm font-bold",
                  mode === t.k ? "bg-primary-soft text-primary" : "text-graphite hover:bg-secondary",
                )}
              >
                {t.n}
              </button>
            ))}
          </div>
        }
      />
      {mode === "auto" ? <AutomationSection /> : <ManualSection />}
    </AppShell>
  );
}

function ManualSection() {
  const [tab, setTab] = useState<"new" | "running" | "history">("new");
  return (
    <>
      <div className="mb-3.5 flex h-10 items-center gap-1 rounded-md border border-border bg-white p-1">
        {[
          { k: "new", n: "新建发布" },
          { k: "running", n: "发布中" },
          { k: "history", n: "发布记录" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as typeof tab)}
            className={cn(
              "h-8 rounded px-3 text-xs font-bold",
              tab === t.k ? "bg-primary-soft text-primary" : "text-graphite hover:bg-secondary",
            )}
          >
            {t.n}
          </button>
        ))}
      </div>
      {tab === "new" ? <Wizard /> : <JobList filter={tab} />}
    </>
  );
}

function AutomationSection() {
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
    <>
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex h-10 items-center gap-1 rounded-md border border-border bg-white p-1">
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
        <button
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> 新建自动化任务
        </button>
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
    </>
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
          <DrawerField label="任务名称">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：总部每日内容"
              className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
            />
          </DrawerField>
          <DrawerField label="任务归属">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>总部品牌</option>
              <option>单个门店</option>
              <option>多个门店</option>
            </select>
          </DrawerField>
          <DrawerField label="门店">
            <div className="flex flex-wrap gap-2">
              {(shops.data ?? []).map((s) => (
                <span key={s.id} className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-graphite">
                  {s.name}
                </span>
              ))}
            </div>
          </DrawerField>
          <DrawerField label="素材来源">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>智能从素材库挑选</option>
              <option>仅 AI 生成</option>
              <option>仅门店上传</option>
            </select>
          </DrawerField>
          <DrawerField label="内容类型">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>图文</option>
              <option>短视频</option>
              <option>纯文案</option>
            </select>
          </DrawerField>
          <div className="grid grid-cols-2 gap-3">
            <DrawerField label="每日数量">
              <input type="number" defaultValue={3} className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm" />
            </DrawerField>
            <DrawerField label="执行时间">
              <input type="time" defaultValue="10:00" className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm" />
            </DrawerField>
          </div>
          <DrawerField label="发布平台（默认全选）">
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
          </DrawerField>
          <DrawerField label="失败处理策略">
            <select className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
              <option>自动重试 1 次</option>
              <option>暂停任务</option>
              <option>通知运营</option>
            </select>
          </DrawerField>
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

function DrawerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold text-graphite">{label}</div>
      {children}
    </div>
  );
}

function Wizard() {
  const [step, setStep] = useState(1);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [scope, setScope] = useState<"hq" | "store" | "multi_store">("hq");
  const [shopIds, setShopIds] = useState<string[]>(["hq"]);
  const [platforms, setPlatforms] = useState<Platform[]>(["xhs", "wechat_channels", "douyin", "kuaishou"]);
  const [copy, setCopy] = useState<GeneratedCopy | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const assets = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });

  const toggleAsset = (id: string) =>
    setSelectedAssets((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  const togglePlatform = (p: Platform) =>
    setPlatforms((arr) => (arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]));
  const toggleShop = (id: string) =>
    setShopIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      setCopy(await aigcApi.generateCopy({ assetIds: selectedAssets, scope, platforms }));
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await publishApi.create({
        title: copy?.title ?? "新发布任务",
        scopeType: scope,
        shopIds,
        platforms,
        contentType: "image_text",
        assetIds: selectedAssets,
        copy: copy ? { title: copy.title, body: copy.body, tags: copy.tags } : undefined,
      });
      setCreated(true);
    } finally {
      setCreating(false);
    }
  };

  const steps = [
    { n: 1, label: "选择素材" },
    { n: 2, label: "发布范围" },
    { n: 3, label: "AI 文案" },
    { n: 4, label: "创建任务" },
  ];

  if (created) {
    return (
      <Panel>
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Check className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-black">发布任务已创建</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            将按平台依次执行，可在「发布中」查看进度。
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => {
                setCreated(false);
                setStep(1);
                setSelectedAssets([]);
                setCopy(null);
              }}
              className="inline-flex h-9 items-center rounded-md border border-border bg-white px-4 text-sm font-bold hover:bg-secondary"
            >
              再建一个
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-3.5">
      <Panel title="步骤">
        <div className="space-y-1.5 p-2">
          {steps.map((s) => (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-bold",
                step === s.n
                  ? "border-[#fecdd3] bg-primary-soft text-primary"
                  : s.n < step
                    ? "border-border bg-white text-graphite"
                    : "border-border bg-[#fafafa] text-muted-foreground",
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                step === s.n ? "bg-primary text-primary-foreground" : s.n < step ? "bg-[var(--success)] text-white" : "bg-border text-graphite",
              )}>
                {s.n < step ? <Check className="h-3 w-3" /> : s.n}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      </Panel>

      <div className="space-y-3.5">
        {step === 1 && (
          <Panel title="Step 1 · 选择素材" hint={`已选 ${selectedAssets.length} 个`}>
            <div className="grid grid-cols-4 gap-3 p-4">
              {(assets.data ?? []).map((a) => {
                const on = selectedAssets.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAsset(a.id)}
                    className={cn(
                      "rounded-md border text-left transition",
                      on ? "border-primary ring-2 ring-primary/15" : "border-border hover:bg-secondary",
                    )}
                  >
                    <div className="h-24 rounded-t-md bg-gradient-to-br from-secondary to-primary-soft" />
                    <div className="p-2.5">
                      <div className="line-clamp-1 text-[13px] font-bold">{a.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{a.shopName}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <NextBar onNext={() => setStep(2)} canNext={selectedAssets.length > 0} />
          </Panel>
        )}

        {step === 2 && (
          <Panel title="Step 2 · 发布范围与平台">
            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 text-xs font-bold text-graphite">发布范围</div>
                <div className="flex gap-2">
                  {[
                    { k: "hq", n: "总部品牌" },
                    { k: "store", n: "单个门店" },
                    { k: "multi_store", n: "多个门店" },
                  ].map((s) => (
                    <button
                      key={s.k}
                      onClick={() => setScope(s.k as typeof scope)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm font-bold",
                        scope === s.k ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                      )}
                    >
                      {s.n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-bold text-graphite">选择门店</div>
                <div className="flex flex-wrap gap-2">
                  {(shops.data ?? []).map((s) => {
                    const on = shopIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleShop(s.id)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs font-bold",
                          on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                        )}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-bold text-graphite">发布平台（默认全选）</div>
                <div className="grid grid-cols-4 gap-2">
                  {PLATFORMS.map((p) => {
                    const on = platforms.includes(p.k);
                    return (
                      <button
                        key={p.k}
                        onClick={() => togglePlatform(p.k)}
                        className={cn(
                          "rounded-md border p-3 text-left",
                          on ? "border-primary bg-primary-soft" : "border-border bg-white hover:bg-secondary",
                        )}
                      >
                        <div className={cn("text-sm font-black", on ? "text-primary" : "text-foreground")}>{p.n}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{p.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <NextBar onBack={() => setStep(1)} onNext={() => setStep(3)} canNext={shopIds.length > 0 && platforms.length > 0} />
          </Panel>
        )}

        {step === 3 && (
          <Panel title="Step 3 · AI 文案" hint="根据已选素材生成">
            <div className="space-y-4 p-4">
              {!copy && !generating && (
                <EmptyState
                  title="还没有生成文案"
                  description="点击下方按钮，根据已选素材自动生成标题、正文与标签。"
                  action={
                    <button
                      onClick={handleGenerate}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-95"
                    >
                      <Sparkles className="h-4 w-4" /> 根据素材生成文案
                    </button>
                  }
                />
              )}
              {generating && (
                <div className="space-y-3">
                  <div className="h-6 animate-pulse rounded bg-secondary" />
                  <div className="h-20 animate-pulse rounded bg-secondary" />
                </div>
              )}
              {copy && (
                <>
                  <div>
                    <div className="text-xs font-bold text-graphite">标题</div>
                    <input
                      defaultValue={copy.title}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-semibold outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-graphite">正文</div>
                    <textarea
                      defaultValue={copy.body}
                      className="mt-1 h-32 w-full resize-none rounded-md border border-border bg-white p-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-graphite">标签</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {copy.tags.map((t) => (
                        <span key={t} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-graphite">#{t}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-bold hover:bg-secondary"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> 重新生成
                  </button>
                </>
              )}
            </div>
            <NextBar onBack={() => setStep(2)} onNext={() => setStep(4)} canNext={!!copy} />
          </Panel>
        )}

        {step === 4 && (
          <Panel title="Step 4 · 创建并发布">
            <div className="space-y-4 p-4">
              <Review label="发布标题" value={copy?.title ?? "—"} />
              <Review
                label="范围"
                value={`${scope === "hq" ? "总部品牌" : scope === "store" ? "单个门店" : "多门店"} · ${shopIds.length} 个`}
              />
              <Review label="素材" value={`${selectedAssets.length} 个`} />
              <Review
                label="平台"
                value={
                  <div className="flex gap-1.5">
                    {platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                  </div>
                }
              />
              <details className="rounded-md border border-border bg-[#fafafa] p-3">
                <summary className="cursor-pointer text-xs font-bold text-graphite">高级选项（定时、每日数量、失败处理）</summary>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <SelectField label="发布时机" options={["立即发布", "定时发布"]} />
                  <SelectField label="每日发布数量" options={["1", "3", "5"]} />
                  <SelectField label="失败处理" options={["自动重试 1 次", "暂停任务", "通知运营"]} />
                </div>
              </details>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <button onClick={() => setStep(3)} className="text-sm font-bold text-graphite hover:underline">
                上一步
              </button>
              <button
                disabled={creating}
                onClick={handleCreate}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-95 disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> {creating ? "创建中…" : "创建并发布"}
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Review({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#f0f0f1] pb-3 last:border-b-0">
      <span className="text-xs font-bold text-graphite">{label}</span>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <div>
      <div className="font-bold text-graphite">{label}</div>
      <select className="mt-1 h-8 w-full rounded border border-border bg-white px-2 text-xs">
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function NextBar({ onBack, onNext, canNext }: { onBack?: () => void; onNext: () => void; canNext: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      {onBack ? (
        <button onClick={onBack} className="text-sm font-bold text-graphite hover:underline">上一步</button>
      ) : <span />}
      <button
        disabled={!canNext}
        onClick={onNext}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-95 disabled:opacity-50"
      >
        下一步 <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function JobList({ filter }: { filter: "running" | "history" }) {
  const jobs = useQuery({ queryKey: ["publish-jobs"], queryFn: () => publishApi.list() });
  const data = (jobs.data ?? []).filter((j) =>
    filter === "running" ? j.status === "running" || j.status === "queued" : true,
  );
  return (
    <Panel title={filter === "running" ? "进行中的发布" : "全部发布记录"} hint={`共 ${data.length} 条`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#fafafa] text-left text-xs text-muted-foreground">
            <th className="h-11 px-4 font-semibold">任务名称</th>
            <th className="h-11 px-4 font-semibold">范围</th>
            <th className="h-11 px-4 font-semibold">平台</th>
            <th className="h-11 px-4 font-semibold">计划时间</th>
            <th className="h-11 px-4 font-semibold">状态</th>
            <th className="h-11 px-4 font-semibold">操作</th>
          </tr>
        </thead>
        <tbody>
          {data.map((j) => (
            <tr key={j.id} className="border-b border-[#f0f0f1] last:border-b-0">
              <td className="h-12 px-4 font-bold">{j.title}</td>
              <td className="h-12 px-4 text-graphite">{j.shopNames?.join("、")}</td>
              <td className="h-12 px-4">
                <div className="flex flex-wrap gap-1">
                  {j.targets.map((t) => (
                    <PlatformBadge key={t.id} platform={t.platform} />
                  ))}
                </div>
              </td>
              <td className="h-12 px-4 text-muted-foreground">{j.scheduledAt}</td>
              <td className="h-12 px-4">
                <StatusBadge tone={jobStatusTone(j.status)}>{jobStatusLabel(j.status)}</StatusBadge>
              </td>
              <td className="h-12 px-4">
                <button className="text-xs font-bold text-primary hover:underline">查看详情</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}