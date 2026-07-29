import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { shopsApi } from "@/api/shops";
import { assetsApi } from "@/api/assets";
import {
  directorApi,
  toImageUrls,
  toPickedAssets,
  type DirectorScript,
  type MarketingCharacter,
} from "@/api/director";
import { clipsFromScript, type DirectorClip } from "@/api/director-payload";
import type { Asset } from "@/types";
import {
  ArrowLeft, Sparkles, RefreshCw, Loader2, X, CheckCircle2,
  AlertTriangle, Wand2, Film, User2, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/aigc/video")({
  head: () => ({
    meta: [
      { title: "AI 短视频生成 · BOOMER.OFF" },
      { name: "description", content: "脚本驱动的多镜头 AI 短视频导演工作台" },
    ],
  }),
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
const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const REF_MAX = 20;

function VideoFlow() {
  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });

  const [shopId, setShopId] = useState<string>("");
  useEffect(() => { if (!shopId && shops.data?.[0]) setShopId(shops.data[0].id); }, [shops.data, shopId]);

  // params (Step 01)
  const [vtype, setVtype] = useState<(typeof VIDEO_TYPES)[number]["v"]>("store_tour");
  const [style, setStyle] = useState<(typeof STYLES)[number]["v"]>("steady");
  const [realism, setRealism] = useState<"real" | "illustration">("real");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(15);
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("9:16");
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("720p");

  // Step 02: reference assets (up to 20)
  const assetsQ = useQuery({
    queryKey: ["assets", "video-pick", shopId],
    queryFn: () => assetsApi.list({ shopId: shopId || "all", kind: "image", limit: 60 }),
  });
  const [refAssets, setRefAssets] = useState<Asset[]>([]);
  const toggleAsset = (a: Asset) => {
    setRefAssets((arr) => {
      const on = arr.some((x) => x.id === a.id);
      if (on) return arr.filter((x) => x.id !== a.id);
      if (arr.length >= REF_MAX) return arr;
      return [...arr, a];
    });
  };

  // Step 03: character
  const [characterMode, setCharacterMode] = useState<"auto" | "library">("auto");
  const [selectedCharacter, setSelectedCharacter] = useState<MarketingCharacter | null>(null);
  const charactersQ = useQuery({
    queryKey: ["marketing_characters", shopId],
    queryFn: () => directorApi.listCharacters(shopId),
    enabled: !!shopId && characterMode === "library",
  });

  // Step 04: brief + script
  const [topic, setTopic] = useState("");
  const [highlight, setHighlight] = useState("");
  const [brief, setBrief] = useState("");
  const [script, setScript] = useState<DirectorScript | null>(null);
  const [scriptBusy, setScriptBusy] = useState(false);

  // Step 05: storyboard + render
  const [sbBusy, setSbBusy] = useState(false);
  const [frames, setFrames] = useState<(string | null)[]>([]);
  const [job, setJob] = useState<{
    id: string;
    status: string;
    videoUrl?: string;
    error?: string;
    progress?: number;
    assetId?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const imageUrls = useMemo(() => toImageUrls(refAssets), [refAssets]);
  const pickedAssets = useMemo(() => toPickedAssets(refAssets), [refAssets]);
  const clips: DirectorClip[] = useMemo(() => clipsFromScript(script), [script]);
  const shotCount = clips.length;

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const jobId = job.id;
    pollRef.current = setInterval(async () => {
      try {
        const next = await directorApi.pollJob(jobId);
        const nextStatus = next.job.status;
        const finalUrl = (next.job.final_video_url as string | null | undefined) ?? undefined;
        // error_message lives on `job`; progress is at the ROOT.
        const nextErr = (next.job.error_message as string | null | undefined) ?? undefined;
        const nextProgress = next.progress;
        setJob((prev) => prev && prev.id === jobId ? ({
          ...prev,
          status: nextStatus,
          progress: typeof nextProgress === "number" ? nextProgress : prev.progress,
          videoUrl: finalUrl ?? prev.videoUrl,
          error: nextErr ?? prev.error,
        }) : prev);
        if (nextStatus === "done") {
          if (finalUrl) {
            try {
              const done = await directorApi.completeJob({ jobId, finalVideoUrl: finalUrl });
              if (done.asset_id) {
                setJob((prev) => prev && prev.id === jobId
                  ? { ...prev, assetId: done.asset_id }
                  : prev);
              }
            } catch (e) { console.warn("[director-complete-job]", e); }
          } else {
            console.warn("[director-poll-job] status=done but final_video_url missing");
          }
        }
      } catch (e: any) {
        console.error(e);
      }
    }, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [job?.id, job?.status]);

  const genScript = async () => {
    if (!shopId) { toast.error("请先选择门店"); return; }
    if (imageUrls.length === 0) { toast.error("请先选择参考图（最少 1 张）"); return; }
    setScriptBusy(true);
    setScript(null);
    try {
      const r = await directorApi.generateScript({
        shopId,
        imageUrls,
        videoType: vtype,
        duration,
        aspect,
        topic: topic || undefined,
        highlight: highlight || undefined,
        style: `${style}${realism === "illustration" ? " · illustration" : " · real"}`,
        briefTranscript: brief || undefined,
      });
      const flat = clipsFromScript(r);
      if (flat.length === 0) {
        toast.error("AI 未返回有效镜头，请重试或调整立意");
        return;
      }
      setScript(r); // preserve as-is (hook + scenes + outro)
      setFrames([]);
      toast.success(`已生成 ${flat.length} 镜脚本`);
    } catch (e: any) {
      toast.error(`脚本生成失败：${e?.message ?? e}`);
    } finally { setScriptBusy(false); }
  };

  const genStoryboard = async () => {
    if (!script || !shopId) return;
    setSbBusy(true);
    try {
      const r = await directorApi.generateStoryboard({
        shopId,
        script, // pass original hook+scenes+outro script
        pickedAssets,
        // Same character choice as the eventual render — storyboard must
        // reuse it so the reference character matches every scene image.
        selectedCharacter: characterMode === "library" ? selectedCharacter : null,
        style,
        realism,
      });
      const nextClips = clipsFromScript(r.script);
      if (nextClips.length !== clips.length) {
        toast.error(`分镜镜头数（${nextClips.length}）与脚本（${clips.length}）不一致，已忽略`);
        return;
      }
      setScript(r.script);
      setFrames(r.frames);
      toast.success("分镜图已生成");
    } catch (e: any) {
      toast.error(`分镜生成失败：${e?.message ?? e}`);
    } finally { setSbBusy(false); }
  };

  const submitRender = async () => {
    if (!script || !shopId) return;
    if (characterMode === "library" && !selectedCharacter) {
      toast.error("请从角色库选择一个角色，或改为 AI 自动");
      return;
    }
    setSubmitting(true);
    try {
      const { jobId } = await directorApi.createJob({
        shopId,
        script, // ORIGINAL script — preserved verbatim
        pickedAssets,
        aspect,
        style: `${style} · ${realism}`,
        resolution,
        userPrompt: [topic, highlight, brief].filter(Boolean).join("\n") || undefined,
        characterMode,
        selectedCharacter: characterMode === "library" ? selectedCharacter : null,
      });
      setJob({ id: jobId, status: "queued", progress: 0 });
      toast.success("已提交，正在渲染");
    } catch (e: any) {
      toast.error(`提交失败：${e?.message ?? e}`);
    } finally { setSubmitting(false); }
  };

  const sbReady = clips.length > 0 && frames.length === clips.length;
  const totalDuration = clips.reduce((n, s) => n + (Number(s.duration_s) || 0), 0);

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

      <Link
        to="/aigc/oneclick"
        className="mb-3 flex items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
      >
        <Sparkles className="h-3.5 w-3.5" />
        想更快？试试「BOOMER 帮我拍 · 一键 15 秒出片」 →
      </Link>

      <div className="space-y-4">
        {/* Step 01 · 视频基础设置 */}
        <StepPanel num="01" title="视频基础设置" hint="类型 · 情绪 · 画风 · 时长 · 画幅 · 分辨率">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
            <ChoiceRow label="视频类型" value={vtype} options={VIDEO_TYPES.map((t) => ({ v: t.v, label: t.label }))} onChange={(v) => setVtype(v as any)} />
            <ChoiceRow label="情绪风格" value={style} options={STYLES.map((t) => ({ v: t.v, label: t.label }))} onChange={(v) => setStyle(v as any)} />
            <ChoiceRow label="画风" value={realism} options={[{ v: "real", label: "真人写实" }, { v: "illustration", label: "插画" }]} onChange={(v) => setRealism(v as any)} />
            <ChoiceRow label="时长" value={String(duration)} options={DURATIONS.map((d) => ({ v: String(d), label: `${d}s` }))} onChange={(v) => setDuration(Number(v) as any)} />
            <ChoiceRow label="画幅" value={aspect} options={ASPECTS.map((a) => ({ v: a, label: a }))} onChange={(v) => setAspect(v as any)} />
            <ChoiceRow label="分辨率" value={resolution} options={RESOLUTIONS.map((r) => ({ v: r, label: r }))} onChange={(v) => setResolution(v as any)} />
          </div>
          <p className="border-t border-border px-4 py-2 text-[11px] font-medium text-muted-foreground">
            渲染模型固定使用 seedance-2-pro（脚本驱动多镜路径，稳定默认）。
          </p>
        </StepPanel>

        {/* Step 02 · 参考素材 */}
        <StepPanel num="02" title="参考素材" hint={`最多 ${REF_MAX} 张 · 已选 ${refAssets.length}/${REF_MAX}`}>
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
              {refAssets.length > 0 && (
                <button
                  onClick={() => setRefAssets([])}
                  className="mt-3 inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-[11px] font-bold text-graphite hover:bg-secondary"
                ><X className="h-3 w-3" /> 清空</button>
              )}
              <p className="mt-3 text-[11px] font-medium text-muted-foreground">
                会作为 AI 编剧的画面依据与最终渲染的参考图。
              </p>
            </div>
            <div>
              <Label>从素材库挑选</Label>
              <div className="mt-1 grid grid-cols-6 gap-2">
                {(assetsQ.data ?? []).map((a) => {
                  const on = refAssets.some((x) => x.id === a.id);
                  const reachedMax = refAssets.length >= REF_MAX && !on;
                  return (
                    <button
                      key={a.id}
                      disabled={reachedMax}
                      onClick={() => toggleAsset(a)}
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
              </div>
              {refAssets.length >= REF_MAX && (
                <p className="mt-2 text-[11px] font-bold text-amber-600">已达上限 {REF_MAX} 张。</p>
              )}
            </div>
          </div>
        </StepPanel>

        {/* Step 03 · 主角 */}
        <StepPanel num="03" title="主角" hint="选定后同一个角色会锁定到所有镜头">
          <div className="p-4">
            <div className="flex gap-2">
              <button
                onClick={() => { setCharacterMode("auto"); setSelectedCharacter(null); }}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold",
                  characterMode === "auto" ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                )}
              ><Bot className="h-3.5 w-3.5" /> AI 自动创建</button>
              <button
                onClick={() => setCharacterMode("library")}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold",
                  characterMode === "library" ? "border-primary bg-primary-soft text-primary" : "border-border bg-white text-graphite hover:bg-secondary",
                )}
              ><User2 className="h-3.5 w-3.5" /> 从角色库选择</button>
            </div>
            {characterMode === "auto" ? (
              <p className="mt-3 text-[11px] font-medium text-muted-foreground">
                AI 会按品牌资料 + 立意自动设计出镜角色形象。同一角色会锁定到所有镜头，避免跳脸。
              </p>
            ) : (
              <div className="mt-3">
                {charactersQ.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载角色库…</div>
                ) : (charactersQ.data ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    当前门店角色库为空。可先前往手机端创建，或改用「AI 自动创建」。
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-3">
                    {(charactersQ.data ?? []).map((c) => {
                      const on = selectedCharacter?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCharacter(c)}
                          className={cn(
                            "overflow-hidden rounded-md border-2 text-left",
                            on ? "border-primary" : "border-border hover:border-primary/50",
                          )}
                        >
                          <div className="aspect-square bg-secondary">
                            {c.cover_url ? (
                              <img src={c.cover_url} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="truncate text-xs font-bold">{c.name}</div>
                            {c.role_label && <div className="truncate text-[10px] text-muted-foreground">{c.role_label}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedCharacter && (
                  <p className="mt-3 text-[11px] font-bold text-primary">
                    已选：{selectedCharacter.name} — 全片将锁定此角色。
                  </p>
                )}
              </div>
            )}
          </div>
        </StepPanel>

        {/* Step 04 · 立意 & 生成脚本 */}
        <StepPanel
          num="04"
          title="立意 & 生成脚本"
          hint={script ? `脚本就绪 · ${shotCount} 镜 · 合计 ${totalDuration}s` : "填写立意，一键生成 AI 脚本"}
          actions={
            <button
              onClick={genScript}
              disabled={scriptBusy || !shopId || imageUrls.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {scriptBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {script ? "重新生成脚本" : "生成脚本"}
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4 p-4">
            <div>
              <Label>主题（可选）</Label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：周末新品试穿"
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
              />
              <Label>
                <span className="mt-3 block">高光要点（可选）</span>
              </Label>
              <input
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
                placeholder="一句高光：例如「突出周末活动 + 地址」"
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <Label>简报 / 立意（可选）</Label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="想传达的信息、口吻、活动、要点。AI 编剧会按此展开镜头。"
                className="mt-1 h-24 w-full resize-none rounded-md border border-border bg-white p-2 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="border-t border-border p-4">
            {!script ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                点右上「生成脚本」；AI 编剧会返回精确的分镜列表，每镜的时长与顺序会原样保留。
              </div>
            ) : (
              <ScriptShotList script={script} clips={clips} />
            )}
          </div>
        </StepPanel>

        {/* Step 05 · 分镜图 + 渲染 */}
        <StepPanel
          num="05"
          title="分镜图 & 渲染出片"
          hint={script ? `${Math.min(frames.length, shotCount)}/${shotCount} 分镜就绪` : "等待脚本"}
          actions={
            <button
              onClick={genStoryboard}
              disabled={sbBusy || !script}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {sbBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
              {sbReady ? "重新生成分镜" : "生成分镜图"}
            </button>
          }
        >
          <div className="p-4">
            {!script ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                先在 Step 04 生成脚本。
              </div>
            ) : (
              <StoryboardList clips={clips} frames={frames} sbBusy={sbBusy} />
            )}

            <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <button
                onClick={submitRender}
                disabled={!script || submitting || !!job}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {job ? "已提交" : "确认渲染出片"}
              </button>
              {!script && (
                <span className="text-[11px] font-bold text-amber-600">需要先生成脚本</span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                模型 · seedance-2-pro（固定） · 主角 · {characterMode === "auto" ? "AI 自动" : selectedCharacter?.name ?? "未选"}
              </span>
            </div>

            {job && <JobPanel job={job} onReset={() => setJob(null)} />}
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

function ScriptShotList({ script, clips }: { script: DirectorScript; clips: DirectorClip[] }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-black">{script.title ?? "AI 脚本"}</div>
      <div className="grid gap-2">
        {clips.map((s, i) => (
          <div key={i} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-black text-graphite">
                {i === 0 ? "HOOK" : i === clips.length - 1 ? "OUTRO" : `#${i}`}
              </span>
              <span className="text-[11px] font-bold text-primary">{s.duration_s}s</span>
              {typeof s.image_index === "number" && (
                <span className="text-[10px] text-muted-foreground">参考图 #{s.image_index + 1}</span>
              )}
            </div>
            <div className="mt-1 text-xs font-bold">{s.scene}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">动作：{s.action}</div>
            {s.dialogue && <div className="mt-0.5 text-[11px] text-muted-foreground">口播：{s.dialogue}</div>}
            {s.subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">字幕：{s.subtitle}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryboardList({ clips, frames, sbBusy }: { clips: DirectorClip[]; frames: (string | null)[]; sbBusy: boolean }) {
  return (
    <div className="grid gap-2">
      {clips.map((s, i) => {
        // Positional lookup — frames must NEVER be filtered/compacted upstream,
        // otherwise shot #2's storyboard would render at shot #1's slot.
        const url = frames[i] ?? null;
        return (
          <div key={i} className="flex gap-3 rounded-md border border-border bg-card p-3">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                  {sbBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "无分镜图"}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-black text-graphite">
                  {i === 0 ? "HOOK" : i === clips.length - 1 ? "OUTRO" : `#${i}`}
                </span>
                <span className="text-[11px] font-bold text-primary">{s.duration_s}s</span>
              </div>
              <div className="mt-1 text-xs font-bold">{s.scene}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">动作：{s.action}</div>
              {s.dialogue && <div className="mt-0.5 text-[11px] text-muted-foreground">口播：{s.dialogue}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JobPanel({ job, onReset }: { job: { id: string; status: string; videoUrl?: string; error?: string; progress?: number }; onReset: () => void }) {
  const failed = job.status === "failed";
  const done = job.status === "done";
  const pct = typeof job.progress === "number" ? Math.round(job.progress) : done ? 100 : 30;
  return (
    <div className={cn(
      "mt-4 rounded-md border p-4",
      failed ? "border-amber-300 bg-amber-50" : "border-border bg-secondary/30",
    )}>
      <div className="flex items-center gap-2">
        {failed ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        <span className="text-sm font-black">{failed ? "失败" : done ? "已完成" : "渲染中"}</span>
        <span className="text-[11px] font-medium text-muted-foreground">任务 #{job.id}</span>
        <span className="ml-auto text-[11px] font-bold text-graphite">{pct}%</span>
      </div>
      {!failed && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {done && job.videoUrl && (
        <video src={job.videoUrl} controls playsInline className="mt-3 max-h-96 w-full rounded-md bg-black" />
      )}
      {failed && (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-amber-900">{job.error ?? "渲染失败，请稍后重试。"}</div>
          <button
            onClick={onReset}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
          ><RefreshCw className="h-3 w-3" /> 重来</button>
        </div>
      )}
    </div>
  );
}