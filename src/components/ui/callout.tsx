import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CalloutTone = "info" | "positive" | "warning" | "negative";

const styles: Record<CalloutTone, string> = {
  info: "border-navy-200 bg-navy-50 text-navy-900 dark:border-navy-700 dark:bg-navy-800/60 dark:text-navy-50",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-50",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-50",
  negative: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/30 dark:text-red-50",
};
const icons: Record<CalloutTone, ReactNode> = {
  info: <Info className="size-4" aria-hidden />,
  positive: <CircleCheck className="size-4" aria-hidden />,
  warning: <TriangleAlert className="size-4" aria-hidden />,
  negative: <CircleAlert className="size-4" aria-hidden />,
};

export function Callout({ tone = "info", title, children, className, action }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div role={tone === "negative" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-sm", styles[tone], className)}>
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
