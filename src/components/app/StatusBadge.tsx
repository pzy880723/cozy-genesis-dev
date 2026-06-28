import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const tones: Record<Tone, string> = {
  success: "bg-[color-mix(in_oklab,var(--success)_12%,white)] text-[var(--success)]",
  warning: "bg-[color-mix(in_oklab,var(--warning)_15%,white)] text-[var(--warning)]",
  danger: "bg-primary-soft text-destructive",
  neutral: "bg-secondary text-graphite",
  info: "bg-primary-soft text-primary",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function jobStatusTone(status: string): Tone {
  if (status === "success" || status === "enabled" || status === "valid" || status === "running") return "success";
  if (status === "queued" || status === "checking") return "neutral";
  if (status === "partial_failed" || status === "paused") return "warning";
  if (status === "failed" || status === "error" || status === "expired" || status === "disabled") return "danger";
  return "neutral";
}

export function jobStatusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: "排队中",
    running: "运行中",
    success: "成功",
    partial_failed: "部分失败",
    failed: "失败",
    cancelled: "已取消",
    enabled: "运行中",
    paused: "已暂停",
    error: "异常",
    valid: "正常",
    expired: "失效",
    checking: "检测中",
    disabled: "已停用",
  };
  return map[status] ?? status;
}