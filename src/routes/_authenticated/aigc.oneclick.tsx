import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { shopsApi } from "@/api/shops";
import {
  aigcApi,
  ONECLICK_MAX_REFS,
  type RenderJob,
  type Script,
} from "@/api/aigc";
import {
  ALL_CATEGORY,
  buildCategoryOptions,
  getBrandProfile,
  ONECLICK_VIDEO_TYPES,
  type OneClickVideoType,
} from "@/api/brand";
import type { Asset } from "@/types";
import {
  ArrowLeft, Sparkles, Wand2, Loader2, RefreshCw, CheckCircle2,
  AlertTriangle, X, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/aigc/oneclick")({
  head: () => ({ meta: [{ title: "部门帮我拍 · 一键出片" }] }),
  component: OneClickPage,
});

const ASPECTS = ["9:16", "1:1", "16:9"] as const;
const MODELS = [
  { id: "seedance-2-lite", label: "Fast（默认）", hint: "速度优先 · 一分钟出片" },
  { id: "seedance-2-pro", label: "PRO", hint: "写实最佳 · 略慢" },
] as const;

type Phase = "idle" | "scripting" | "designing" | "rendering" | "done" | "failed";

function OneClickPage() {
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });

  const [shopId, setShopId] = useState<string>("");
  useEffect(() => {
    if (!shopId && shops.data?.[0]) setShopId(shops.data[0].id);
  }, [shops.data, shopId]);

  const profile = useMemo(() => getBrandProfile(shopId), [shopId]);
  const [introExpanded, setIntroExpanded] = useState(false);

  const [types, setTypes] = useState<OneClickVideoType[]>(["store_tour"]);
  const [category, setCategory] = useState<string>(ALL_CATEGORY);

  // 切换店铺：品类选项变化，重置为店铺主营或全品类
  useEffect(() => {
    const opts = buildCategoryOptions(profile).map((o) => o.v);
    if (!opts.includes(category)) {
      setCategory(profile.primaryCategory ?? ALL_CATEGORY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const [picked, setPicked] = useState<Asset[]>([]);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickShortage, setPickShortage] = useState<string | undefined>();

  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("9:16");
  const [modelId, setModelId] = useState<string>(MODELS[0].id);

  const [phase, setPhase] = useState<Phase>("idle");
  const [script, setScript] = useState<Script | null>(null);
  const [job, setJob] = useState<RenderJob | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 渲染轮询
  useEffect(() => {
    if (!job || phase !== "rendering") return;
    pollRef.current = setInterval(async () => {
      const next = await aigcApi.pollRenderJob(job.id, job.startedAt, job.progress.total);
      setJob(next);
      if (next.phase === "done") setPhase("done");
      if (next.phase === "failed") {
        setErrMsg(next.error ?? "渲染失败");
        setPhase("failed");
      }
    }, 1200);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [job?.id, phase]);

  const autoPick = async () => {
    if (!shopId) return;
    if (types.length === 0) return;
    setPickBusy(true);
    setPickShortage(undefined);
    try {
      const r = await aigcApi.pickAutoAssets({
        shopId, types, category, max: ONECLICK_MAX_REFS,
      });
      setPicked(r.assets);
      setPickShortage(r.shortage);
    } finally { setPickBusy(false); }
  };

  const removePicked = (id: string) => setPicked((arr) => arr.filter((a) => a.id !== id));

  const canGenerate = shopId && types.length > 0 && picked.length > 0 && phase === "idle";

  const generate = async () => {
    if (!canGenerate) return;
    setErrMsg("");
    setScript(null);
    setJob(null);
    try {
      setPhase("scripting");
      await new Promise((r) => setTimeout(r, 600));
      setPhase("designing");
      const res = await aigcApi.oneClickGenerate({
        shopId, types, category, assetIds: picked.map((a) => a.id), aspect, modelId,
      });
      setScript(res.script);
      setJob({
        id: res.jobId,
        phase: "queued",
        progress: { done: 0, total: res.script.scenes.length },
        startedAt: Date.now(),
      });
      setPhase("rendering");
    } catch (e: any) {
      setErrMsg(e?.message ?? "一键生成失败");
      setPhase("failed");
    }
  };

  const reset = () => {
    setPhase("idle"); setJob(null); setScript(null); setErrMsg("");
  };

  const categoryOptions = buildCategoryOptions(profile);

  return (
    <AppShell>
      <PageHeader
        title="部门帮我拍 · 一键出片"
        description="选店铺 → 勾类型 → 一键 15 秒成片，脚本、角色都交给 AI"
        actions={
          <Link to="/aigc" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-bold text-graphite hover:bg-secondary">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回创作中心
          </Link>
        }
      />

      <div className="space-y-4">
        {/* 01 店铺 + 品牌资料 */}
        <Panel title="01 · 归属店铺" hint="AI 会按品牌资料设计画面与角色">
          <div className="grid grid-cols-[280px_1fr] gap-4 p-4">
            <div>
              <Label>门店</Label>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
              >
                {(shops.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                未配置品牌资料？前往「系统设置 · 品牌知识库」补充。
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">{profile.brandName}</span>
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {profile.brandTone}
                </span>
                <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                  设计依据 · 来自后台
                </span>
              </div>
              <p className={cn(
                "mt-2 text-xs text-foreground/80",
                !introExpanded && "line-clamp-2",
              )}>{profile.brandIntro}</p>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {profile.categories.map((c) => (
                    <span key={c} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-graphite border border-border">
                      {c}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setIntroExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  {introExpanded ? <>收起 <ChevronUp className="h-3 w-3" /></> : <>展开 <ChevronDown className="h-3 w-3" /></>}
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* 02 视频类型（多选） */}
        <Panel title="02 · 视频类型" hint={`多选 · 已选 ${types.length} 项`}>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {ONECLICK_VIDEO_TYPES.map((t) => {
                const on = types.includes(t.v);
                return (
                  <button
                    key={t.v}
                    onClick={() => setTypes((arr) => on ? arr.filter((x) => x !== t.v) : [...arr, t.v])}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-bold",
                      on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                    )}
                  >
                    {on && <CheckCircle2 className="-ml-0.5 mr-1 inline h-3 w-3" />}
                    {t.label}
                  </button>
                );
              })}
            </div>
            {types.length === 0 && (
              <p className="mt-2 text-[11px] font-bold text-amber-600">至少勾一个视频类型</p>
            )}
          </div>
        </Panel>

        {/* 03 倾向品类（单选） */}
        <Panel title="03 · 倾向品类" hint="决定画面与脚本侧重；来自店铺品类">
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((o) => {
                const on = category === o.v;
                return (
                  <button
                    key={o.v}
                    onClick={() => setCategory(o.v)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-bold",
                      on ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                    )}
                  >{o.label}</button>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* 04 自动选图 */}
        <Panel
          title="04 · 自动选图"
          hint={`仅从「上传」原图挑选 · 最多 ${ONECLICK_MAX_REFS} 张 · 已选 ${picked.length}/${ONECLICK_MAX_REFS}`}
          actions={
            <button
              onClick={autoPick}
              disabled={pickBusy || !shopId || types.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {pickBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {picked.length ? "再来一组" : "一键自动挑图"}
            </button>
          }
        >
          <div className="p-4">
            {picked.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                <Info className="mx-auto mb-2 h-4 w-4" />
                点右上「一键自动挑图」。仅从你们上传的基础图中挑，不含 AI 生成图。
              </div>
            ) : (
              <div className="grid grid-cols-9 gap-2">
                {picked.map((a) => (
                  <div key={a.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-secondary">
                    {a.thumbnailUrl ? (
                      <img src={a.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">无图</div>
                    )}
                    <button
                      onClick={() => removePicked(a.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      title="移除这张"
                    ><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            {pickShortage && (
              <p className="mt-3 text-[11px] font-bold text-amber-600">{pickShortage}</p>
            )}
          </div>
        </Panel>

        {/* 05 生成设置 */}
        <Panel title="05 · 生成设置" hint="时长固定 15 秒（CDS 单段上限）">
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <ChoiceRow
                label="画幅"
                value={aspect}
                options={ASPECTS.map((a) => ({ v: a, label: a }))}
                onChange={(v) => setAspect(v as any)}
              />
              <ChoiceRow
                label="渲染模型"
                value={modelId}
                options={MODELS.map((m) => ({ v: m.id, label: `${m.label} · ${m.hint}` }))}
                onChange={(v) => setModelId(v)}
              />
            </div>
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-black text-primary-foreground disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> ✨ 一键生成 15s 视频
              </button>
              <span className="text-[11px] font-medium text-muted-foreground">
                时长 15s · 一段直出 · 720p
              </span>
              {phase !== "idle" && phase !== "rendering" && (
                <button
                  onClick={reset}
                  className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-graphite hover:bg-secondary"
                ><RefreshCw className="h-3 w-3" /> 重来</button>
              )}
            </div>

            {phase !== "idle" && (
              <ResultPanel
                phase={phase}
                script={script}
                job={job}
                errMsg={errMsg}
                onRetry={() => { reset(); setTimeout(generate, 50); }}
                onFallbackFast={() => { setModelId("seedance-2-lite"); reset(); setTimeout(generate, 50); }}
                onSwapPics={() => { reset(); autoPick(); }}
              />
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

const PHASE_TEXT: Record<Phase, string> = {
  idle: "",
  scripting: "① AI 编剧中（基于品牌资料）",
  designing: "② AI 设计角色形象",
  rendering: "③ 镜头渲染中",
  done: "✅ 出片完成",
  failed: "渲染失败",
};

function ResultPanel({
  phase, script, job, errMsg, onRetry, onFallbackFast, onSwapPics,
}: {
  phase: Phase;
  script: Script | null;
  job: RenderJob | null;
  errMsg: string;
  onRetry: () => void;
  onFallbackFast: () => void;
  onSwapPics: () => void;
}) {
  const failed = phase === "failed";
  const done = phase === "done";
  const steps: { key: Phase; label: string }[] = [
    { key: "scripting", label: "① AI 编剧" },
    { key: "designing", label: "② 设计角色" },
    { key: "rendering", label: "③ 镜头渲染" },
    { key: "done", label: "✅ 完成" },
  ];
  const order: Phase[] = ["scripting", "designing", "rendering", "done"];
  const cur = order.indexOf(phase);
  const pct = job?.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 0;

  return (
    <div className={cn(
      "rounded-md border p-4",
      failed ? "border-amber-300 bg-amber-50" : "border-border bg-secondary/30",
    )}>
      <div className="flex items-center gap-2">
        {failed
          ? <AlertTriangle className="h-4 w-4 text-amber-600" />
          : done
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        <span className="text-sm font-black">{PHASE_TEXT[phase]}</span>
        {job && phase === "rendering" && (
          <span className="ml-auto text-[11px] font-bold text-graphite">
            {job.progress.done}/{job.progress.total} 镜 · {pct}%
          </span>
        )}
      </div>

      {!failed && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "rounded border px-2 py-1.5 text-center text-[11px] font-bold",
                i < cur && "border-emerald-300 bg-emerald-50 text-emerald-700",
                i === cur && "border-primary bg-primary-soft text-primary",
                i > cur && "border-border bg-white text-muted-foreground",
              )}
            >{s.label}</div>
          ))}
        </div>
      )}

      {phase === "rendering" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {script && (
        <details className="mt-3 rounded border border-border bg-white p-2 text-xs">
          <summary className="cursor-pointer font-black">脚本预览 · {script.title}</summary>
          <ul className="mt-2 space-y-1">
            {script.scenes.map((sc) => (
              <li key={sc.id} className="text-[11px] text-foreground/80">
                <span className="font-bold text-primary">{sc.time}</span> · {sc.visual} ｜ {sc.voice}
              </li>
            ))}
          </ul>
        </details>
      )}

      {done && job?.videoUrl && (
        <div className="mt-3 space-y-3">
          <video src={job.videoUrl} controls playsInline className="max-h-96 w-full rounded-md bg-black" />
          <div className="flex flex-wrap gap-2">
            <a
              href={job.videoUrl}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground"
            >下载 MP4</a>
            <Link
              to="/publish"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-4 text-xs font-bold text-graphite hover:bg-secondary"
            >去发布中心</Link>
            <button
              onClick={onRetry}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-4 text-xs font-bold text-graphite hover:bg-secondary"
            ><RefreshCw className="h-3.5 w-3.5" /> 重新生成</button>
          </div>
        </div>
      )}

      {failed && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-amber-900">{errMsg || "渲染异常，可尝试降配后重试。"}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onFallbackFast} className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100">换 Fast 模型重试</button>
            <button onClick={onSwapPics} className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100">换一组图</button>
            <button onClick={onRetry} className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100">直接重试</button>
          </div>
        </div>
      )}
    </div>
  );
}