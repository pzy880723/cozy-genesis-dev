import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
      <div className="min-w-0">
        <h2 className="font-display text-[28px] leading-[1.1] tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-sm border border-border bg-card shadow-[0_1px_0_0_var(--hairline)] ${className}`}>
      {(title || actions) && (
        <header className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 items-baseline gap-2.5">
            {title ? (
              <strong className="text-[13px] font-bold tracking-wide text-foreground">{title}</strong>
            ) : null}
            {hint ? (
              <span className="truncate text-[11px] font-medium text-muted-foreground">{hint}</span>
            ) : null}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-secondary" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs font-medium text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}