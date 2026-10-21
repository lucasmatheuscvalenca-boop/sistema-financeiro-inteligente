import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, className, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-link">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5 pt-4", className)} {...props} />;
}
