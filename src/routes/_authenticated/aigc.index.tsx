import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/PageHeader";
import { Video, Image as ImageIcon, FileText, Sparkles, ChevronRight, Library, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/aigc/")({
  head: () => ({ meta: [{ title: "AI 创作中心 · BOOMER.OFF AIGC" }] }),
  component: AigcHub,
});

function AigcHub() {
  return (
    <AppShell>
      <PageHeader title="AI 创作中心" description="一条主线把短视频从立意走到出片，图片 / 文案 / 素材库 / 分发协同。" />

      {/* Hero · 短视频主入口 */}
      <Link to="/aigc/video" className="group block">
        <section className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary-soft via-card to-card p-6 transition-all hover:border-primary">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Video className="h-8 w-8" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-black tracking-[0.18em] text-primary">PRIMARY · 主流程</div>
              <h3 className="mt-1 text-xl font-black text-foreground">AI 短视频生成</h3>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                选店铺 / 参考素材 · 聊立意 · 设参数 · 生成脚本 + 分镜静帧 · 渲染出片
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-primary/30 px-3 py-1.5 text-xs font-black text-primary">
              开始生成 <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-5 gap-2 text-[11px] font-bold text-muted-foreground">
            {["1 立意", "2 参数", "3 脚本", "4 分镜", "5 渲染"].map((s, i) => (
              <div key={s} className="rounded-md border border-border bg-card/60 px-2 py-2 text-center">
                <span className={cn("inline-block", i === 0 && "text-primary")}>{s}</span>
              </div>
            ))}
          </div>
        </section>
      </Link>

      {/* 副入口 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <SubTile to="/aigc/image" num="02" icon={ImageIcon} title="AI 图片" desc="对话出图 · 海报 · 修图改图" />
        <SubTile to="/aigc/copy" num="03" icon={FileText} title="AI 文案" desc="看图写文 · 平台口吻 · 标题标签" />
      </div>

      {/* 管理与分发 */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="h-1 w-1 rounded-full bg-primary" />
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">管理与分发</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ManageTile to="/assets" icon={Library} title="素材库" desc="历史产出 · 一键复用 · 下载视频" />
          <ManageTile to="/publish" icon={Send} title="内容分发" desc="抖音 · 小红书 · 视频号 · 快手" />
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] font-medium text-muted-foreground">
        品牌信息 · 商品类目 · 门店定位
        <span className="ml-2 font-black text-primary">已经预设给 AI，不用每次再说一遍</span>
      </p>
    </AppShell>
  );
}

function SubTile({
  to, num, icon: Icon, title, desc,
}: { to: string; num: string; icon: any; title: string; desc: string }) {
  return (
    <Link to={to} className="group block">
      <div className="flex h-full items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-black tracking-[0.18em] text-primary">{num}</span>
            <h4 className="text-[15px] font-black">{title}</h4>
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{desc}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function ManageTile({
  to, icon: Icon, title, desc,
}: { to: string; icon: any; title: string; desc: string }) {
  return (
    <Link to={to} className="group block">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-graphite">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-black">{title}</div>
          <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{desc}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
      </div>
    </Link>
  );
}