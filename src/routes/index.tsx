import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/app/MetricCard";
import {
  StatusBadge,
  jobStatusLabel,
  jobStatusTone,
} from "@/components/app/StatusBadge";
import { publishApi } from "@/api/publish";
import { accountsApi } from "@/api/accounts";
import { automationApi } from "@/api/automation";
import { assetsApi } from "@/api/assets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "工作台 · BOOMER.OFF AIGC" },
      { name: "description", content: "总部今日发布、异常账号与门店内容总览。" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const jobs = useQuery({ queryKey: ["publish-jobs"], queryFn: () => publishApi.list() });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => accountsApi.list() });
  const automations = useQuery({ queryKey: ["automations"], queryFn: () => automationApi.list() });
  const assets = useQuery({ queryKey: ["assets"], queryFn: () => assetsApi.list() });

  const allJobs = jobs.data ?? [];
  const allAccounts = accounts.data ?? [];
  const allAutomations = automations.data ?? [];
  const allAssets = assets.data ?? [];

  const todayPending = allJobs.filter((j) => j.status === "queued").length;
  const todayPublished = allJobs.filter((j) => j.status === "success").length;
  const aiGenerated = allAssets.filter((a) => a.source === "ai").length;
  const runningAutomations = allAutomations.filter((a) => a.status === "enabled").length;
  const badAccounts = allAccounts.filter((a) => a.status === "expired" || a.status === "disabled");
  const failedTargets = allJobs.flatMap((j) => j.targets).filter((t) => t.status === "failed").length;

  return (
    <AppShell>
      <PageHeader
        title="今日运营总览"
        description="总部与门店的 AI 生成、发布任务、账号状态和自动化运行情况。"
        actions={
          <>
            <Link
              to="/automation"
              className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3.5 text-sm font-bold hover:bg-secondary"
            >
              创建自动化
            </Link>
            <Link
              to="/publish"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-bold text-primary-foreground hover:opacity-95"
            >
              新建发布任务
            </Link>
          </>
        }
      />

      <div className="mb-3.5 grid grid-cols-6 gap-3">
        <MetricCard label="今日待发布" value={todayPending} />
        <MetricCard label="AI 已生成" value={aiGenerated} />
        <MetricCard label="今日已发布" value={todayPublished} />
        <MetricCard label="运行中自动化" value={runningAutomations} />
        <MetricCard label="异常账号" value={badAccounts.length} tone={badAccounts.length ? "danger" : "default"} />
        <MetricCard label="失败任务" value={failedTargets} tone={failedTargets ? "warning" : "default"} />
      </div>

      <div className="mb-3.5 grid grid-cols-[1.45fr_1fr] gap-3.5">
        <Panel title="今日发布计划" hint="按执行时间排序">
          <div>
            {allJobs.slice(0, 4).map((job) => (
              <div
                key={job.id}
                className="grid grid-cols-[84px_1fr_110px_82px] items-center gap-3 border-b border-[#f0f0f1] px-4 py-3 text-sm last:border-b-0"
              >
                <b className="text-sm font-black">{job.scheduledAt?.slice(11, 16) ?? "—"}</b>
                <div>
                  <b className="text-sm font-bold">{job.title}</b>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {job.targets.map((t) => t.accountName).join(" · ")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {job.scopeType === "hq" ? "总部品牌" : job.scopeType === "multi_store" ? "多门店" : job.shopNames?.[0]}
                </span>
                <StatusBadge tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="异常提醒" hint="需要人工处理">
          <div>
            {badAccounts.map((a) => (
              <div key={a.id} className="grid grid-cols-[64px_1fr_70px] items-center gap-3 border-b border-[#f0f0f1] px-4 py-3 last:border-b-0">
                <StatusBadge tone="danger">账号</StatusBadge>
                <div>
                  <b className="text-sm font-bold">{a.displayName} 失效</b>
                  <div className="mt-0.5 text-xs text-muted-foreground">{a.ownerName} · 请重新扫码登录</div>
                </div>
                <Link to="/accounts" className="text-right text-xs font-bold text-destructive hover:underline">处理</Link>
              </div>
            ))}
            {failedTargets > 0 && (
              <div className="grid grid-cols-[64px_1fr_70px] items-center gap-3 border-b border-[#f0f0f1] px-4 py-3 last:border-b-0">
                <StatusBadge tone="warning">任务</StatusBadge>
                <div>
                  <b className="text-sm font-bold">{failedTargets} 个发布目标失败</b>
                  <div className="mt-0.5 text-xs text-muted-foreground">账号响应超时，可在发布中心重试。</div>
                </div>
                <Link to="/publish" className="text-right text-xs font-bold text-[var(--warning)] hover:underline">查看</Link>
              </div>
            )}
            <div className="grid grid-cols-[64px_1fr_70px] items-center gap-3 border-b border-[#f0f0f1] px-4 py-3 last:border-b-0">
              <StatusBadge tone="neutral">素材</StatusBadge>
              <div>
                <b className="text-sm font-bold">3 个门店 7 天未上传</b>
                <div className="mt-0.5 text-xs text-muted-foreground">建议总部代运营或提醒门店。</div>
              </div>
              <Link to="/assets" className="text-right text-xs font-bold text-graphite hover:underline">查看</Link>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="门店内容表现" hint="总部可代运营所有门店">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#fafafa] text-left text-xs text-muted-foreground">
              <th className="h-11 px-4 font-semibold">范围</th>
              <th className="h-11 px-4 font-semibold">今日素材</th>
              <th className="h-11 px-4 font-semibold">今日生成</th>
              <th className="h-11 px-4 font-semibold">今日发布</th>
              <th className="h-11 px-4 font-semibold">成功率</th>
              <th className="h-11 px-4 font-semibold">异常</th>
              <th className="h-11 px-4 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "总部品牌", a: 16, g: 12, p: 9, r: "100%", warn: null, op: "发起任务" },
              { name: "上海中信泰富店", a: 8, g: 6, p: 5, r: "96%", warn: null, op: "代运营" },
              { name: "上海闵行728总部", a: 3, g: 2, p: 1, r: "80%", warn: "需补素材", op: "查看" },
              { name: "南京新街口店", a: 1, g: 0, p: 0, r: "—", warn: "账号失效", op: "处理" },
              { name: "上海静安店", a: 5, g: 3, p: 2, r: "100%", warn: null, op: "代运营" },
            ].map((r) => (
              <tr key={r.name} className="border-b border-[#f0f0f1] last:border-b-0">
                <td className="h-12 px-4 font-bold">{r.name}</td>
                <td className="h-12 px-4 tabular-nums">{r.a}</td>
                <td className="h-12 px-4 tabular-nums">{r.g}</td>
                <td className="h-12 px-4 tabular-nums">{r.p}</td>
                <td className="h-12 px-4 tabular-nums">{r.r}</td>
                <td className="h-12 px-4">
                  {r.warn ? (
                    <StatusBadge tone={r.warn === "账号失效" ? "danger" : "warning"}>{r.warn}</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">正常</StatusBadge>
                  )}
                </td>
                <td className="h-12 px-4">
                  <button className="text-xs font-bold text-primary hover:underline">{r.op}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </AppShell>
  );
}
