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
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black leading-tight tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm font-medium text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
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
    <section className={`rounded-lg border border-border bg-card ${className}`}>
      {(title || actions) && (
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          <div className="flex items-baseline gap-2">
            {title ? <strong className="text-sm font-black">{title}</strong> : null}
            {hint ? <span className="text-xs font-semibold text-muted-foreground">{hint}</span> : null}
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