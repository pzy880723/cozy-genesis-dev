import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { shopsApi } from "@/api/shops";
import { assetsApi } from "@/api/assets";
import { aigcApi, type BriefTurn, type Script, type RenderJob, type RenderPhase, type VideoBrief } from "@/api/aigc";
import {
  ArrowLeft, Sparkles, Send, RefreshCw, Loader2, ImagePlus, X, CheckCircle2, AlertTriangle, Wand2, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/aigc/video")({
  head: () => ({ meta: [{ title: "AI 短视频生成 · BOOMER.OFF" }] }),
  component: VideoFlow,
});

const VIDEO_TYPES = [
  { v: "store_tour", label: "探店" },
  { v: "product_showcase", label: "产品展示" },
  { v: "store_ambience", label: "店铺氛围" },
  { v: "new_arrival", label: "新品上架" },
] as const;
const STYLES = [
  { v: "steady", label: "稳重" },
  { v: "lively", label: "活泼" },
  { v: "energetic", label: "激动" },
  { v: "elegant", label: "优雅" },
  { v: "nostalgic", label: "怀旧" },
  { v: "playful", label: "俏皮" },
] as const;
const DURATIONS = [15, 20, 30, 45, 60] as const;
const ASPECTS = ["9:16", "1:1", "16:9"] as const;
const MODELS = [
  { id: "seedance-2-pro", label: "PRO", hint: "写实最佳 · 慢" },
  { id: "seedance-2-lite", label: "Fast", hint: "速度优先" },
] as const;
const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const STRATEGIES = [
  { v: "auto", label: "自动" },
  { v: "one_shot", label: "整段一次" },
  { v: "per_shot", label: "按镜分段" },
] as const;
const REF_MAX = 20;
const CHARACTERS = ["店员小 K", "顾客阿桃", "暂不选"] as const;

function VideoFlow() {
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const assets = useQuery({ queryKey: ["assets", "video-pick"], queryFn: () => assetsApi.list({ kind: "image", limit: 24 }) });

  const [shopId, setShopId] = useState<string>("");
  useEffect(() => { if (!shopId && shops.data?.[0]) setShopId(shops.data[0].id); }, [shops.data, shopId]);

  const [refImages, setRefImages] = useState<string[]>([]);
  const [character, setCharacter] = useState<string | null>(null);

  // brief chat
  const [brief, setBrief] = useState<BriefTurn[]>([]);
  const [userMsg, setUserMsg] = useState("");
  const [briefBusy, setBriefBusy] = useState(false);

  // params
  const [vtype, setVtype] = useState<(typeof VIDEO_TYPES)[number]["v"]>("store_tour");
  const [style, setStyle] = useState<(typeof STYLES)[number]["v"]>("steady");
  const [duration, setDuration] = useState<number>(15);
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("9:16");
  const [highlight, setHighlight] = useState("");

  // script + storyboard
  const [script, setScript] = useState<Script | null>(null);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [sbBusy, setSbBusy] = useState(false);

  // render
  const [modelId, setModelId] = useState<string>(MODELS[0].id);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");
  const [realism, setRealism] = useState<"real" | "illustration">("real");
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]["v"]>("auto");

  const [job, setJob] = useState<RenderJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!job || job.phase === "done" || job.phase === "failed") return;
    pollRef.current = setInterval(async () => {
      const next = await aigcApi.pollRenderJob(job.id, job.startedAt, job.progress.total);
      setJob(next);
    }, 1200);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [job?.id, job?.phase]);

  const sendBrief = async () => {
    const msg = userMsg.trim();
    if (!msg) return;
    const userTurn: BriefTurn = { role: "user", content: msg };
    const next = [...brief, userTurn];
    setBrief(next);
    setUserMsg("");
    setBriefBusy(true);
    try {
      const reply = await aigcApi.generateBrief({ userMsg: msg, turn: next.filter((m) => m.role === "user").length - 1 });
      setBrief((b) => [...b, reply]);
    } finally { setBriefBusy(false); }
  };

  const genScript = async () => {
    if (!shopId) return;
    setScriptBusy(true);
    setScript(null);
    try {
      const r = await aigcApi.generateVideoScript(buildBrief());
      const s: Script = { title: r.title, scenes: r.scenes.map((sc) => ({ ...sc })) };
      setScript(s);
    } finally { setScriptBusy(false); }
  };

  const genStoryboard = async () => {
    if (!script) return;
    setSbBusy(true);
    try {
      const sb = await aigcApi.generateStoryboard({ scenes: script.scenes });
      setScript({ title: script.title, scenes: sb.scenes });
    } finally { setSbBusy(false); }
  };

  const redoScene = async (idx: number) => {
    if (!script) return;
    setSbBusy(true);
    try {
      const sb = await aigcApi.generateStoryboard({ scenes: script.scenes, onlyIndices: [idx] });
      setScript({ title: script.title, scenes: sb.scenes });
    } finally { setSbBusy(false); }
  };

  const submitRender = async () => {
    if (!script || !shopId) return;
    const total = script.scenes.length;
    const { jobId } = await aigcApi.submitRenderJob({ shopId, script, brief: buildBrief(), modelId, resolution, realism, strategy });
    setJob({ id: jobId, phase: "queued", progress: { done: 0, total }, startedAt: Date.now() });
  };

  const buildBrief = (): VideoBrief => ({
    shopId,
    refAssetIds: refImages,
    character,
    vtype,
    style,
    duration,
    aspect,
    highlight,
    briefDigest: brief.filter((m) => m.kind === "draft_script").map((m) => m.content).join("\n") || brief.map((m) => `${m.role}: ${m.content}`).join("\n"),
  });

  const failJobForDemo = () => {
    if (!job) return;
    setJob({ ...job, phase: "failed", error: "渲染服务返回 5xx，可能是参考图过多或分辨率过高。" });
  };

  const sbReady = !!script && script.scenes.every((s) => s.storyboardUrl);

  return (
    <AppShell>
      <PageHeader
        title="AI 短视频生成"
        description="先定参数 → 选参考图 → 选主角 → 聊脚本 → 生成分镜 → 渲染出片"
        actions={
          <Link to="/aigc" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-bold text-graphite hover:bg-secondary">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回创作中心
          </Link>
        }
      />

      <div className="space-y-4">
        {/* Step 01 · 视频基础设置 */}
        <StepPanel num="01" title="视频基础设置" hint="类型 · 情绪 · 画风 · 时长 · 画幅 · 模型">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
            <ChoiceRow label="视频类型" value={vtype} options={VIDEO_TYPES.map((t) => ({ v: t.v, label: t.label }))} onChange={(v) => setVtype(v as any)} />
            <ChoiceRow label="情绪风格" value={style} options={STYLES.map((t) => ({ v: t.v, label: t.label }))} onChange={(v) => setStyle(v as any)} />
            <ChoiceRow label="画风" value={realism} options={[{ v: "real", label: "真人写实" }, { v: "illustration", label: "插画" }]} onChange={(v) => setRealism(v as any)} />
            <ChoiceRow label="时长" value={String(duration)} options={DURATIONS.map((d) => ({ v: String(d), label: `${d}s` }))} onChange={(v) => setDuration(Number(v))} />
            <ChoiceRow label="画幅" value={aspect} options={ASPECTS.map((a) => ({ v: a, label: a }))} onChange={(v) => setAspect(v as any)} />
            <ChoiceRow label="渲染模型" value={modelId} options={MODELS.map((m) => ({ v: m.id, label: `${m.label} · ${m.hint}` }))} onChange={(v) => setModelId(v)} />
          </div>
        </StepPanel>

        {/* Step 02 · 参考图 */}
        <StepPanel num="02" title="参考图" hint={`最多 ${REF_MAX} 张 · 已选 ${refImages.length}/${REF_MAX}`}>
          <div className="grid grid-cols-[260px_1fr] gap-4 p-4">
            <div>
              <Label>归属门店</Label>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
              >
                {(shops.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {refImages.length > 0 && (
                <div className="mt-3 space-y-1">
                  <Label>已选 {refImages.length}/{REF_MAX}</Label>
                  <button
                    onClick={() => setRefImages([])}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-graphite hover:bg-secondary"
                  ><X className="h-3 w-3" /> 清空</button>
                </div>
              )}
            </div>
            <div>
              <Label>从素材库挑选</Label>
              <div className="mt-1 grid grid-cols-6 gap-2">
                {(assets.data ?? []).map((a) => {
                  const on = refImages.includes(a.id);
                  const reachedMax = refImages.length >= REF_MAX && !on;
                  return (
                    <button
                      key={a.id}
                      disabled={reachedMax}
                      onClick={() => setRefImages((arr) => on ? arr.filter((x) => x !== a.id) : [...arr, a.id])}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-md border-2",
                        on ? "border-primary" : "border-transparent hover:border-border",
                        reachedMax && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      {a.thumbnailUrl ? (
                        <img src={a.thumbnailUrl} className="h-full w-full object-cover" alt="" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-secondary text-[10px] text-muted-foreground">无图</div>
                      )}
                      {on && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                          <CheckCircle2 className="h-5 w-5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
                <button
                  disabled={refImages.length >= REF_MAX}
                  className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
                >
                  <ImagePlus className="h-5 w-5" />
                </button>
              </div>
              {refImages.length >= REF_MAX && (
                <p className="mt-2 text-[11px] font-bold text-amber-600">已达上限 {REF_MAX} 张，先移除再加新图。</p>
              )}
            </div>
          </div>
        </StepPanel>

        {/* Step 03 · 主角 */}
        <StepPanel num="03" title="主角" hint="可选，不选则按场景自动生成出镜">
          <div className="grid grid-cols-3 gap-3 p-4">
            {CHARACTERS.map((c) => {
              const on = character === c || (c === "暂不选" && !character);
              return (
                <button
                  key={c}
                  onClick={() => setCharacter(c === "暂不选" ? null : c)}
                  className={cn(
                    "rounded-md border px-3 py-3 text-left text-xs font-bold",
                    on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                  )}
                >{c}</button>
              );
            })}
          </div>
        </StepPanel>

        {/* Step 04 · 立意对话生成脚本 */}
        <StepPanel
          num="04"
          title="立意对话 · 生成脚本"
          hint={script ? `脚本就绪 · ${script.scenes.length} 个场景` : "先和 AI 聊几句，再生成脚本"}
          actions={
            <button
              onClick={genScript}
              disabled={scriptBusy || !shopId}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {scriptBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {script ? "重新生成脚本" : "生成脚本"}
            </button>
          }
        >
          <div className="grid grid-cols-[1fr_320px] gap-4 p-4">
            <div className="flex h-72 flex-col rounded-md border border-border bg-secondary/40">
              <div className="flex-1 space-y-2 overflow-auto p-3">
                {brief.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">还没开始 · 说一句你想拍什么 →</div>
                ) : brief.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-xs font-medium",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-white text-foreground border border-border",
                    )}>{m.content}</div>
                  </div>
                ))}
                {briefBusy && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> AI 思考中</div>
                )}
              </div>
              <div className="flex gap-2 border-t border-border p-2">
                <input
                  value={userMsg}
                  onChange={(e) => setUserMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendBrief(); }}
                  placeholder="例如：周末搞个新品试穿活动，想拍一条 9:16 探店"
                  className="h-9 flex-1 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={sendBrief}
                  disabled={briefBusy || !userMsg.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >发送 <Send className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <Label>立意要点</Label>
              <textarea
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
                placeholder="一句高光：例如「突出周末活动 + 地址」"
                className="mt-1 h-20 w-full resize-none rounded-md border border-border bg-white p-2 text-xs outline-none focus:border-primary"
              />
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                已聊 {brief.filter((m) => m.role === "user").length} 轮 · AI 草稿：
                {brief.some((m) => m.kind === "draft_script") ? "已就绪 ✓" : "等待中"}
              </p>
            </div>
          </div>
          <div className="border-t border-border p-4">
            {!script ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                先聊立意，点右上「生成脚本」。
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-black">{script.title}</div>
                <div className="grid gap-2">
                  {script.scenes.map((sc) => (
                    <div key={sc.id} className="rounded-md border border-border bg-card p-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-black text-graphite">#{sc.id}</span>
                        <span className="text-[11px] font-bold text-primary">{sc.time}</span>
                      </div>
                      <div className="mt-1 text-xs font-bold">{sc.visual}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">旁白：{sc.voice}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </StepPanel>

        {/* Step 05 · 分镜头 + 渲染 */}
        <StepPanel
          num="05"
          title="分镜头 & 渲染出片"
          hint={script ? `${script.scenes.filter((s) => s.storyboardUrl).length}/${script.scenes.length} 静帧已合成` : "等待脚本"}
          actions={
            <button
              onClick={genStoryboard}
              disabled={sbBusy || !script}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {sbBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
              {script?.scenes.some((s) => s.storyboardUrl) ? "重生成分镜" : "生成分镜"}
            </button>
          }
        >
          <div className="p-4">
            {!script ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                先在 Step 04 生成脚本，再回这里生成分镜头静帧。
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-2">
                  {script.scenes.map((sc, i) => (
                    <div key={sc.id} className="flex gap-3 rounded-md border border-border bg-card p-3">
                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
                        {sc.storyboardUrl ? (
                          <img src={sc.storyboardUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            {sbBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "无静帧"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-black text-graphite">#{sc.id}</span>
                          <span className="text-[11px] font-bold text-primary">{sc.time}</span>
                        </div>
                        <div className="mt-1 text-xs font-bold">{sc.visual}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">旁白：{sc.voice}</div>
                      </div>
                      <button
                        onClick={() => redoScene(i)}
                        disabled={sbBusy}
                        className="inline-flex h-7 shrink-0 items-center gap-1 self-start rounded-md border border-border bg-white px-2 text-[11px] font-bold text-graphite hover:bg-secondary disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" /> 重做这一镜
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4">
              <ChoiceRow label="分辨率" value={resolution} options={RESOLUTIONS.map((r) => ({ v: r, label: r }))} onChange={(v) => setResolution(v as any)} />
              <ChoiceRow label="渲染策略" value={strategy} options={STRATEGIES.map((s) => ({ v: s.v, label: s.label }))} onChange={(v) => setStrategy(v as any)} />
            </div>

            <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <button
                onClick={submitRender}
                disabled={!sbReady || !!job}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {job ? "已提交" : "确认生成视频"}
              </button>
              {!sbReady && (
                <span className="text-[11px] font-bold text-amber-600">需要先生成分镜静帧（全部就绪）</span>
              )}
              {job && job.phase !== "done" && job.phase !== "failed" && (
                <button onClick={failJobForDemo} className="ml-auto text-[11px] font-medium text-muted-foreground underline">
                  模拟失败（演示用）
                </button>
              )}
            </div>

            {job && <RenderJobPanel job={job} onRetry={() => { setJob(null); }} onSubmit={submitRender} setModel={setModelId} setResolution={setResolution} setStrategy={setStrategy} />}
          </div>
        </StepPanel>
      </div>
    </AppShell>
  );
}

function StepPanel({ num, title, hint, actions, children }: { num: string; title: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel
      title={`${num} · ${title}`}
      hint={hint}
      actions={actions}
    >
      {children}
    </Panel>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-black text-graphite">{children}</div>;
}

function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: { v: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.v === value;
          return (
            <button
              key={o.v}
              onClick={() => onChange(o.v)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-bold",
                on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
              )}
            >{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

const PHASE_LABEL: Record<RenderPhase, string> = {
  queued: "排队中", scripting: "脚本锁定", rendering: "渲染中", stitching: "拼接中", done: "已完成", failed: "失败",
};

function RenderJobPanel({
  job, onRetry, onSubmit, setModel, setResolution, setStrategy,
}: {
  job: RenderJob;
  onRetry: () => void;
  onSubmit: () => void;
  setModel: (id: string) => void;
  setResolution: (r: any) => void;
  setStrategy: (s: any) => void;
}) {
  const pct = job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 0;
  const failed = job.phase === "failed";
  return (
    <div className={cn(
      "mt-4 rounded-md border p-4",
      failed ? "border-amber-300 bg-amber-50" : "border-border bg-secondary/30",
    )}>
      <div className="flex items-center gap-2">
        {failed ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : job.phase === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        <span className="text-sm font-black">{PHASE_LABEL[job.phase]}</span>
        <span className="text-[11px] font-medium text-muted-foreground">任务 #{job.id}</span>
        <span className="ml-auto text-[11px] font-bold text-graphite">
          {job.progress.done}/{job.progress.total} 镜 · {pct}%
        </span>
      </div>
      {!failed && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {job.phase === "done" && job.videoUrl && (
        <video src={job.videoUrl} controls playsInline className="mt-3 max-h-96 w-full rounded-md bg-black" />
      )}
      {failed && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-amber-900">{job.error}</div>
          <div className="text-[11px] font-black uppercase tracking-wider text-amber-700">修复建议</div>
          <div className="flex flex-wrap gap-2">
            <FixBtn onClick={() => { setResolution("480p"); onRetry(); setTimeout(onSubmit, 50); }}>降到 480p 重试</FixBtn>
            <FixBtn onClick={() => { setStrategy("per_shot"); onRetry(); setTimeout(onSubmit, 50); }}>改用按镜分段</FixBtn>
            <FixBtn onClick={() => { setModel("seedance-2-lite"); onRetry(); setTimeout(onSubmit, 50); }}>换 Lite 模型</FixBtn>
            <FixBtn onClick={onRetry} variant="ghost">删除任务</FixBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function FixBtn({ children, onClick, variant }: { children: React.ReactNode; onClick: () => void; variant?: "ghost" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold",
        variant === "ghost" ? "text-graphite hover:bg-white" : "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100",
      )}
    >{children}</button>
  );
}