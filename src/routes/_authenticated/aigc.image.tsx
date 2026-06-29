import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/PageHeader";
import { ArrowLeft, Sparkles, Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/aigc/image")({
  head: () => ({ meta: [{ title: "AI 图片 · BOOMER.OFF" }] }),
  component: AigcImage,
});

function AigcImage() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const run = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 800));
    const seed = Date.now();
    setResults([1, 2, 3, 4].map((i) => `https://picsum.photos/seed/aigc-${seed}-${i}/600/600`));
    setBusy(false);
  };

  return (
    <AppShell>
      <PageHeader
        title="AI 图片"
        description="对话出图 · 海报 · 修图改图"
        actions={
          <Link to="/aigc" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-bold text-graphite hover:bg-secondary">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回创作中心
          </Link>
        }
      />
      <div className="grid grid-cols-[360px_1fr] gap-4">
        <Panel title="输入">
          <div className="space-y-3 p-4">
            <label className="block">
              <div className="cursor-pointer rounded-md border-2 border-dashed border-border p-6 text-center text-xs text-muted-foreground hover:border-primary hover:text-primary">
                <Upload className="mx-auto mb-1 h-5 w-5" /> 上传参考图（可选）
              </div>
              <input type="file" accept="image/*" className="hidden" />
            </label>
            <div>
              <div className="text-xs font-black text-graphite">提示词</div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：BOOMER.OFF 夏日新品海报，街头风，明亮色调"
                className="mt-1 h-32 w-full resize-none rounded-md border border-border bg-white p-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              disabled={busy}
              onClick={run}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "生成中…" : "生成 4 张候选"}
            </button>
          </div>
        </Panel>
        <Panel title="结果">
          <div className="p-4">
            {results.length === 0 ? (
              <EmptyState title="还没有生成结果" description="左侧填提示词，点生成。" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {results.map((u) => (
                  <img key={u} src={u} alt="" className="aspect-square w-full rounded-md object-cover" />
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}