import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { aigcApi, type GeneratedCopy } from "@/api/aigc";
import { assetsApi } from "@/api/assets";
import { shopsApi } from "@/api/shops";
import { Sparkles, Copy, Send, RefreshCw, Save, Film, FileText, Image as ImageIcon, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/aigc")({
  head: () => ({ meta: [{ title: "AI 创作中心 · BOOMER.OFF AIGC" }] }),
  component: AigcPage,
});

const TYPES = [
  { key: "image_text", label: "图文生成", icon: ImageIcon },
  { key: "script", label: "短视频脚本", icon: Film },
  { key: "storyboard", label: "分镜生成", icon: Film },
  { key: "video_job", label: "视频生成任务", icon: Wand2 },
  { key: "title_tag", label: "标题/标签", icon: FileText },
] as const;

function AigcPage() {
  const [creationType, setCreationType] = useState<(typeof TYPES)[number]["key"]>("image_text");
  const [scope, setScope] = useState("hq");
  const [platforms, setPlatforms] = useState<string[]>(["xhs", "douyin", "wechat_channels", "kuaishou"]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<GeneratedCopy | null>(null);
  const [loading, setLoading] = useState(false);

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const assets = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });

  const togglePlatform = (p: string) =>
    setPlatforms((arr) => (arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]));
  const toggleAsset = (id: string) =>
    setSelected((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const r = await aigcApi.generateCopy({
        assetIds: selected,
        scope,
        platforms,
        notes,
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="AI 创作中心"
        description="基于素材、品牌知识库和门店画像，标准化产出文案、脚本、分镜与标题。"
      />

      <div className="grid grid-cols-[200px_1fr_1.1fr] gap-3.5">
        {/* Left: types */}
        <Panel title="创作类型">
          <div className="p-2">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = creationType === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setCreationType(t.key)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
                    active ? "bg-primary-soft text-primary" : "text-graphite hover:bg-secondary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Middle: inputs */}
        <Panel title="输入" hint="先选素材，再补充要求">
          <div className="space-y-4 p-4">
            <div>
              <Label>归属</Label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
              >
                {(shops.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>目标平台（默认全平台）</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { k: "xhs", n: "小红书" },
                  { k: "wechat_channels", n: "视频号" },
                  { k: "douyin", n: "抖音" },
                  { k: "kuaishou", n: "快手" },
                ].map((p) => {
                  const on = platforms.includes(p.k);
                  return (
                    <button
                      key={p.k}
                      onClick={() => togglePlatform(p.k)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-xs font-bold",
                        on
                          ? "border-[#fecdd3] bg-primary-soft text-primary"
                          : "border-border bg-white text-graphite hover:bg-secondary",
                      )}
                    >
                      {p.n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>选择素材（{selected.length} 已选）</Label>
              <div className="mt-2 grid max-h-48 grid-cols-3 gap-2 overflow-auto">
                {(assets.data ?? []).slice(0, 9).map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAsset(a.id)}
                      className={cn(
                        "rounded-md border p-2 text-left text-[11px]",
                        on ? "border-primary bg-primary-soft" : "border-border bg-white hover:bg-secondary",
                      )}
                    >
                      <div className="line-clamp-1 font-bold">{a.title}</div>
                      <div className="mt-0.5 text-muted-foreground">{a.shopName}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>补充要求</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例如：突出周末活动、强调门店地址、面向年轻潮流人群"
                className="mt-1 h-20 w-full resize-none rounded-md border border-border bg-white p-2 text-sm outline-none focus:border-primary"
              />
            </div>

            <button
              disabled={loading}
              onClick={handleGenerate}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground hover:opacity-95 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "生成中…" : "生成内容"}
            </button>
          </div>
        </Panel>

        {/* Right: output */}
        <Panel title="输出" hint="结构化结果">
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                <div className="h-6 animate-pulse rounded bg-secondary" />
                <div className="h-20 animate-pulse rounded bg-secondary" />
                <div className="h-6 animate-pulse rounded bg-secondary" />
              </div>
            ) : !result ? (
              <EmptyState
                title="还没有生成结果"
                description="选择素材、归属和平台后，点击生成内容。"
              />
            ) : (
              <div className="space-y-4">
                <Field label="推荐标题">
                  <div className="rounded-md border border-border bg-white p-3 text-sm font-bold">
                    {result.title}
                  </div>
                </Field>
                <Field label="正文">
                  <div className="whitespace-pre-line rounded-md border border-border bg-white p-3 text-sm leading-relaxed">
                    {result.body}
                  </div>
                </Field>
                <Field label="标签">
                  <div className="flex flex-wrap gap-1.5">
                    {result.tags.map((t) => (
                      <span key={t} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-graphite">#{t}</span>
                    ))}
                  </div>
                </Field>
                <Field label="平台适配建议">
                  <div className="grid grid-cols-2 gap-2">
                    {result.platformTips.map((p) => (
                      <div key={p.platform} className="rounded-md border border-border bg-white p-2.5">
                        <div className="text-xs font-bold text-primary">{p.platform}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{p.tip}</div>
                      </div>
                    ))}
                  </div>
                </Field>

                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <ActionButton icon={Copy}>复制</ActionButton>
                  <ActionButton icon={Save}>保存到素材库</ActionButton>
                  <ActionButton icon={RefreshCw} onClick={handleGenerate}>重新生成</ActionButton>
                  <ActionButton icon={Send} primary>用于发布</ActionButton>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-graphite">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function ActionButton({
  icon: Icon,
  children,
  primary,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold",
        primary
          ? "bg-primary text-primary-foreground hover:opacity-95"
          : "border border-border bg-white text-graphite hover:bg-secondary",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}