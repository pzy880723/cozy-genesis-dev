import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { assetsApi, type AssetFilters } from "@/api/assets";
import { shopsApi } from "@/api/shops";
import type { Asset, AssetKind } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Video,
  FileText,
  Film,
  Users,
  Package,
  LayoutGrid,
  List,
  Search,
  Upload,
  Tag,
  Maximize2,
  Send,
  Play,
  Smartphone,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({ meta: [{ title: "素材库 · BOOMER.OFF AIGC" }] }),
  component: AssetsPage,
});

const KINDS: { key: AssetKind | "all"; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all", label: "全部", icon: LayoutGrid },
  { key: "image", label: "图片", icon: ImageIcon },
  { key: "video", label: "视频", icon: Video },
  { key: "copy", label: "文案", icon: FileText },
  { key: "storyboard", label: "分镜", icon: Film },
  { key: "character", label: "角色", icon: Users },
  { key: "product", label: "产品", icon: Package },
];

function AssetsPage() {
  const [filters, setFilters] = useState<AssetFilters>({ kind: "all", shopId: "all", source: "all", origin: "all" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<Asset | null>(null);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(120);

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const assets = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => assetsApi.list(filters),
  });

  const counts: Record<string, number> = {};
  (assets.data ?? []).forEach((a) => (counts[a.kind] = (counts[a.kind] ?? 0) + 1));

  const tagStats = useMemo(() => {
    const map = new Map<string, number>();
    (assets.data ?? []).forEach((a) =>
      a.tags.forEach((t) => map.set(t, (map.get(t) ?? 0) + 1)),
    );
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets.data]);

  const visible = (assets.data ?? []).slice(0, visibleCount);

  const handlePublish = (a: Asset) => {
    toast.success(`已加入发布队列：${a.title}`);
  };

  return (
    <AppShell>
      <PageHeader
        title="素材库"
        description="总部与门店的图片、视频、文案、分镜、角色、产品资产中心。"
        actions={
          <>
            <button
              onClick={() => setTagPanelOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3.5 text-sm font-bold hover:bg-secondary"
            >
              <Tag className="h-4 w-4" /> 标签管理
            </button>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:opacity-95">
              <Upload className="h-4 w-4" /> 上传素材
            </button>
          </>
        }
      />

      <div className="mb-3.5 flex items-center gap-2 rounded-md border border-border bg-[#fafafa] px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          placeholder="搜索素材标题或标签"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={filters.search ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <select
          className="h-7 rounded border border-border bg-white px-2 text-xs font-semibold"
          value={filters.shopId ?? "all"}
          onChange={(e) => setFilters((f) => ({ ...f, shopId: e.target.value }))}
        >
          <option value="all">全部门店</option>
          {(shops.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="h-7 rounded border border-border bg-white px-2 text-xs font-semibold"
          value={filters.source ?? "all"}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as AssetFilters["source"] }))}
        >
          <option value="all">全部来源</option>
          <option value="upload">门店上传</option>
          <option value="ai">AI 生成</option>
        </select>
        <select
          className="h-7 rounded border border-border bg-white px-2 text-xs font-semibold"
          value={filters.origin ?? "all"}
          onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value as AssetFilters["origin"] }))}
          title="区分手机端 App 同步的素材和 PC 端本地生成的素材"
        >
          <option value="all">全部端</option>
          <option value="mobile">📱 手机端</option>
          <option value="pc">💻 PC 端</option>
        </select>
        <div className="flex h-7 items-center overflow-hidden rounded border border-border bg-white">
          <button
            onClick={() => setView("grid")}
            className={cn("flex h-full items-center px-2", view === "grid" ? "bg-primary-soft text-primary" : "text-muted-foreground")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("flex h-full items-center px-2", view === "list" ? "bg-primary-soft text-primary" : "text-muted-foreground")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const active = (filters.kind ?? "all") === k.key;
          const n = k.key === "all" ? (assets.data?.length ?? 0) : counts[k.key as string] ?? 0;
          return (
            <button
              key={k.key}
              onClick={() => {
                setFilters((f) => ({ ...f, kind: k.key }));
                setVisibleCount(120);
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
                active
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-white text-graphite hover:bg-secondary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {k.label}
              <span className={cn("ml-0.5 rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-white/70 text-primary" : "bg-secondary text-muted-foreground")}>{n}</span>
            </button>
          );
        })}
        <span className="ml-auto text-xs font-semibold text-muted-foreground">共 {assets.data?.length ?? 0} 个</span>
      </div>

      <div>
        <Panel>
          {assets.isLoading ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-md bg-secondary" />
              ))}
            </div>
          ) : (assets.data ?? []).length === 0 ? (
            <EmptyState
              title="当前筛选下暂无素材"
              description="请调整门店、类型或时间范围。"
            />
          ) : view === "grid" ? (
            <>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {visible.map((a) => {
                  const publishable = a.kind === "image" || a.kind === "video";
                  return (
                    <div
                      key={a.id}
                      className="group overflow-hidden rounded-md"
                    >
                      <button
                        onClick={() => setPreview(a)}
                        className="relative block aspect-square w-full overflow-hidden bg-gradient-to-br from-secondary to-primary-soft"
                        aria-label={`预览 ${a.title}`}
                      >
                        {a.thumbnailUrl &&
                        (a.kind === "image" ||
                          a.kind === "video" ||
                          a.kind === "storyboard" ||
                          a.kind === "character" ||
                          a.kind === "product") ? (
                          <img
                            src={a.thumbnailUrl}
                            alt={a.title}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                            }}
                          />
                        ) : a.kind === "copy" && a.text ? (
                          <div className="line-clamp-6 p-3 text-left text-[12px] leading-snug text-graphite/80">
                            {a.text}
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            {a.kind === "image" && <ImageIcon className="h-8 w-8 text-graphite/60" />}
                            {a.kind === "video" && <Video className="h-8 w-8 text-graphite/60" />}
                            {a.kind === "copy" && <FileText className="h-8 w-8 text-graphite/60" />}
                            {a.kind === "storyboard" && <Film className="h-8 w-8 text-graphite/60" />}
                            {a.kind === "character" && <Users className="h-8 w-8 text-graphite/60" />}
                            {a.kind === "product" && <Package className="h-8 w-8 text-graphite/60" />}
                          </div>
                        )}
                        {a.kind === "video" && (
                          <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            <Play className="h-3 w-3" /> 视频
                          </div>
                        )}
                        {/* 来源角标（手机/PC） */}
                        <div
                          className="pointer-events-none absolute left-1.5 bottom-1.5 flex h-5 items-center gap-0.5 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white"
                          title={a.origin === "pc" ? "PC 端生成" : "手机端"}
                        >
                          {a.origin === "pc" ? (
                            <><Monitor className="h-3 w-3" />PC</>
                          ) : (
                            <><Smartphone className="h-3 w-3" />手机</>
                          )}
                        </div>
                        {/* 放大入口 */}
                        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                          <Maximize2 className="h-3.5 w-3.5" />
                        </span>
                        {/* 发布入口（仅图片/视频） */}
                        {publishable && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePublish(a);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handlePublish(a);
                              }
                            }}
                            className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition group-hover:pointer-events-auto group-hover:opacity-100"
                            aria-label="发布"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {/* hover 时底部门店名渐变条 */}
                        {a.shopName && (
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/55 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                            <span className="line-clamp-1 text-[10px] font-semibold text-white">{a.shopName}</span>
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              {(assets.data?.length ?? 0) > visibleCount && (
                <div className="flex justify-center p-4">
                  <button
                    onClick={() => setVisibleCount((n) => n + 120)}
                    className="inline-flex h-9 items-center rounded-md border border-border bg-white px-4 text-sm font-bold hover:bg-secondary"
                  >
                    加载更多（剩 {(assets.data?.length ?? 0) - visibleCount}）
                  </button>
                </div>
              )}
            </>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#fafafa] text-left text-xs text-muted-foreground">
                  <th className="h-10 px-4 font-semibold">标题</th>
                  <th className="h-10 px-4 font-semibold">类型</th>
                  <th className="h-10 px-4 font-semibold">归属</th>
                  <th className="h-10 px-4 font-semibold">来源</th>
                  <th className="h-10 px-4 font-semibold">创建时间</th>
                  <th className="h-10 px-4 font-semibold">状态</th>
                </tr>
              </thead>
              <tbody>
                {(assets.data ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-[#f0f0f1] last:border-b-0">
                    <td className="h-12 px-4 font-bold">{a.title}</td>
                    <td className="h-12 px-4 text-graphite">{KINDS.find((k) => k.key === a.kind)?.label}</td>
                    <td className="h-12 px-4 text-graphite">{a.shopName}</td>
                    <td className="h-12 px-4">{a.source === "ai" ? <StatusBadge tone="info">AI 生成</StatusBadge> : "门店上传"}</td>
                    <td className="h-12 px-4 text-muted-foreground">{a.createdAt}</td>
                    <td className="h-12 px-4">{a.publishedAt ? <StatusBadge tone="success">已发布</StatusBadge> : <StatusBadge tone="neutral">未发布</StatusBadge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* 预览弹窗 */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-1 flex items-center gap-2">
              <span>{preview?.title}</span>
              {preview && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-graphite">
                  {preview.origin === "pc" ? (
                    <><Monitor className="h-3 w-3" />PC 端</>
                  ) : (
                    <><Smartphone className="h-3 w-3" />手机端</>
                  )}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-md bg-black/5">
                {preview.kind === "video" && preview.outputUrl ? (
                  <video src={preview.outputUrl} controls autoPlay className="max-h-[70vh] w-full" />
                ) : preview.kind === "copy" && preview.text ? (
                  <pre className="max-h-[70vh] w-full overflow-auto whitespace-pre-wrap p-4 text-sm">{preview.text}</pre>
                ) : preview.outputUrl ? (
                  <img src={preview.outputUrl} alt={preview.title} className="max-h-[70vh] w-auto object-contain" />
                ) : (
                  <div className="p-8 text-sm text-muted-foreground">无可预览内容</div>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{preview.shopName ?? "—"} · {preview.createdAt}</span>
                {(preview.kind === "image" || preview.kind === "video") && (
                  <button
                    onClick={() => { handlePublish(preview); setPreview(null); }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-95"
                  >
                    <Send className="h-3.5 w-3.5" /> 发布
                  </button>
                )}
              </div>
              {preview.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {preview.tags.map((t) => (
                    <span key={t} className="rounded bg-secondary px-2 py-0.5 text-[11px] text-graphite">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 标签管理弹窗 */}
      <Dialog open={tagPanelOpen} onOpenChange={setTagPanelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>标签管理</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              placeholder="搜索标签"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none"
            />
            <div className="max-h-[60vh] space-y-1 overflow-auto">
              {tagStats.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">当前结果集没有标签</div>
              )}
              {tagStats
                .filter(([t]) => !tagSearch || t.toLowerCase().includes(tagSearch.toLowerCase()))
                .map(([t, n]) => (
                  <button
                    key={t}
                    onClick={() => {
                      setFilters((f) => ({ ...f, search: t }));
                      setTagPanelOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="font-semibold">#{t}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{n}</span>
                  </button>
                ))}
            </div>
            <div className="rounded-md border border-dashed border-border bg-[#fafafa] p-3 text-[11px] text-muted-foreground">
              重命名 / 合并 / 删除 标签需要写库权限，将在 Phase 2 开放。
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}