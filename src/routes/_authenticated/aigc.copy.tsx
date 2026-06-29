import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/PageHeader";
import { aigcApi, type GeneratedCopy } from "@/api/aigc";
import { assetsApi } from "@/api/assets";
import { shopsApi } from "@/api/shops";
import { ArrowLeft, Sparkles, Copy, RefreshCw, Save, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/aigc/copy")({
  head: () => ({ meta: [{ title: "AI 文案 · BOOMER.OFF" }] }),
  component: AigcCopy,
});

function AigcCopy() {
  const [scope, setScope] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["xhs", "douyin", "wechat_channels", "kuaishou"]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<GeneratedCopy | null>(null);
  const [loading, setLoading] = useState(false);

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const assets = useQuery({ queryKey: ["assets", "copy-pick"], queryFn: () => assetsApi.list({ limit: 12 }) });

  const togglePlatform = (p: string) =>
    setPlatforms((arr) => arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]);
  const toggleAsset = (id: string) =>
    setSelected((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const run = async () => {
    setLoading(true);
    try {
      const r = await aigcApi.generateCopy({ assetIds: selected, scope, platforms, notes });
      setResult(r);
    } finally { setLoading(false); }
  };

  return (
    <AppShell>
      <PageHeader
        title="AI 文案"
        description="选素材 + 平台 + 补充要求 → 标题 / 正文 / 标签 / 平台适配建议"
        actions={
          <Link to="/aigc" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-bold text-graphite hover:bg-secondary">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回创作中心
          </Link>
        }
      />
      <div className="grid grid-cols-[1fr_1.1fr] gap-4">
        <Panel title="输入">
          <div className="space-y-4 p-4">
            <div>
              <Label>归属</Label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
              >
                <option value="">（请选择）</option>
                {(shops.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>目标平台</Label>
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
                        on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                      )}
                    >{p.n}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>选择素材（{selected.length} 已选）</Label>
              <div className="mt-2 grid max-h-48 grid-cols-4 gap-2 overflow-auto">
                {(assets.data ?? []).slice(0, 12).map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAsset(a.id)}
                      className={cn(
                        "aspect-square overflow-hidden rounded-md border-2",
                        on ? "border-primary" : "border-transparent hover:border-border",
                      )}
                    >
                      {a.thumbnailUrl ? (
                        <img src={a.thumbnailUrl} className="h-full w-full object-cover" alt="" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-secondary text-[10px] text-muted-foreground">{a.kind}</div>
                      )}
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
              onClick={run}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "生成中…" : "生成文案"}
            </button>
          </div>
        </Panel>
        <Panel title="输出">
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                <div className="h-6 animate-pulse rounded bg-secondary" />
                <div className="h-20 animate-pulse rounded bg-secondary" />
              </div>
            ) : !result ? (
              <EmptyState title="还没有生成结果" description="选素材 / 平台后点生成。" />
            ) : (
              <div className="space-y-4">
                <Field label="推荐标题">
                  <div className="rounded-md border border-border bg-white p-3 text-sm font-bold">{result.title}</div>
                </Field>
                <Field label="正文">
                  <div className="whitespace-pre-line rounded-md border border-border bg-white p-3 text-sm leading-relaxed">{result.body}</div>
                </Field>
                <Field label="标签">
                  <div className="flex flex-wrap gap-1.5">
                    {result.tags.map((t) => <span key={t} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-graphite">#{t}</span>)}
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
                  <ActionBtn icon={Copy}>复制</ActionBtn>
                  <ActionBtn icon={Save}>保存到素材库</ActionBtn>
                  <ActionBtn icon={RefreshCw} onClick={run}>重新生成</ActionBtn>
                  <ActionBtn icon={Send} primary>用于发布</ActionBtn>
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
  return <div className="text-xs font-black text-graphite">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1.5">{children}</div></div>;
}
function ActionBtn({ icon: Icon, children, primary, onClick }: { icon: any; children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold",
        primary ? "bg-primary text-primary-foreground" : "border border-border bg-white text-graphite hover:bg-secondary",
      )}
    >
      <Icon className="h-3.5 w-3.5" />{children}
    </button>
  );
}