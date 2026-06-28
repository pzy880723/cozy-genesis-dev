export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "danger" | "warning";
}) {
  const valueColor =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-[var(--warning)]"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={`text-[26px] leading-none font-black tabular-nums ${valueColor}`}>
        {value}
      </div>
      <div className="mt-2 text-xs font-semibold text-muted-foreground">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}