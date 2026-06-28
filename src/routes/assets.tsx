import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { assetsApi, type AssetFilters } from "@/api/assets";
import { shopsApi } from "@/api/shops";
import type { AssetKind } from "@/types";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assets")({
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
  const [filters, setFilters] = useState<AssetFilters>({ kind: "all", shopId: "all", source: "all" });
  const [view, setView] = useState<"grid" | "list">("grid");

  const shops = useQuery({ queryKey: ["shops"], queryFn: () => shopsApi.list() });
  const assets = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => assetsApi.list(filters),
  });

  const counts: Record<string, number> = {};
  (assets.data ?? []).forEach((a) => (counts[a.kind] = (counts[a.kind] ?? 0) + 1));

  return (
    <AppShell>
      <PageHeader
        title="素材库"
        description="总部与门店的图片、视频、文案、分镜、角色、产品资产中心。"
        actions={
          <>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3.5 text-sm font-bold hover:bg-secondary">
              <Tag className="h-4 w-4" /> 批量打标
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

      <div className="grid grid-cols-[180px_1fr] gap-3.5">
        <Panel>
          <div className="p-2">
            {KINDS.map((k) => {
              const Icon = k.icon;
              const active = (filters.kind ?? "all") === k.key;
              return (
                <button
                  key={k.key}
                  onClick={() => setFilters((f) => ({ ...f, kind: k.key }))}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold",
                    active ? "bg-primary-soft text-primary" : "text-graphite hover:bg-secondary",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {k.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {k.key === "all" ? (assets.data?.length ?? 0) : counts[k.key as string] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="素材" hint={`共 ${assets.data?.length ?? 0} 个`}>
          {assets.isLoading ? (
            <div className="grid grid-cols-4 gap-3 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-md bg-secondary" />
              ))}
            </div>
          ) : (assets.data ?? []).length === 0 ? (
            <EmptyState
              title="当前筛选下暂无素材"
              description="请调整门店、类型或时间范围。"
            />
          ) : view === "grid" ? (
            <div className="grid grid-cols-4 gap-3 p-4">
              {(assets.data ?? []).map((a) => (
                <div key={a.id} className="overflow-hidden rounded-md border border-border bg-white">
                  <div className="flex h-28 items-center justify-center bg-gradient-to-br from-secondary to-primary-soft">
                    {a.kind === "image" && <ImageIcon className="h-7 w-7 text-graphite/60" />}
                    {a.kind === "video" && <Video className="h-7 w-7 text-graphite/60" />}
                    {a.kind === "copy" && <FileText className="h-7 w-7 text-graphite/60" />}
                    {a.kind === "storyboard" && <Film className="h-7 w-7 text-graphite/60" />}
                    {a.kind === "character" && <Users className="h-7 w-7 text-graphite/60" />}
                    {a.kind === "product" && <Package className="h-7 w-7 text-graphite/60" />}
                  </div>
                  <div className="p-2.5">
                    <div className="line-clamp-1 text-[13px] font-bold">{a.title}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{a.shopName}</span>
                      {a.source === "ai" ? (
                        <StatusBadge tone="info" className="h-5 px-1.5 text-[10px]">AI</StatusBadge>
                      ) : (
                        <span>上传</span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <button className="flex-1 rounded border border-border bg-white px-2 py-1 text-[11px] font-bold hover:bg-secondary">预览</button>
                      <button className="flex-1 rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-95">发布</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
    </AppShell>
  );
}