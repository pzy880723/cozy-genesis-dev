import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { Bot, BookOpen, Store, Shield, Send, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "系统设置 · BOOMER.OFF AIGC" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { icon: Bot, title: "模型设置", desc: "文案、图片、视频生成模型默认值。" },
  { icon: BookOpen, title: "品牌知识库", desc: "品牌理念、SOP、产品话术、禁用词。" },
  { icon: Store, title: "店铺画像", desc: "门店定位、目标人群和内容口吻。" },
  { icon: Shield, title: "平台规则", desc: "标题长度、标签数量、发布限制。" },
  { icon: Send, title: "默认发布策略", desc: "默认平台、默认时段、失败处理。" },
  { icon: Users, title: "成员权限", desc: "总部、门店管理员、内容运营。" },
];

function SettingsPage() {
  return (
    <AppShell>
      <PageHeader
        title="系统设置"
        description="后期扩展承载：模型、知识库、平台规则与权限。"
      />
      <Panel title="设置模块">
        <div className="grid grid-cols-2 gap-3 p-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.title} className="flex items-start gap-3 rounded-md border border-border bg-white p-4 text-left hover:bg-secondary">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black">{s.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </AppShell>
  );
}