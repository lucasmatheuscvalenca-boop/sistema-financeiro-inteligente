import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CalloutTone = "info" | "positive" | "warning" | "negative";

const styles: Record<CalloutTone, string> = {
  info: "border-l-forest-500 bg-forest-50 text-forest-900 dark:border-l-leaf-300 dark:bg-forest-800/60 dark:text-forest-50",
  positive: "border-l-leaf-600 bg-leaf-50 text-forest-900 dark:border-l-leaf-400 dark:bg-leaf-900/30 dark:text-leaf-50",
  warning: "border-l-gold-500 bg-gold-50 text-gold-900 dark:border-l-gold-300 dark:bg-gold-900/30 dark:text-gold-100",
  negative: "border-l-red-600 bg-red-50 text-red-900 dark:border-l-red-400 dark:bg-red-900/30 dark:text-red-50",
};
const icons: Record<CalloutTone, ReactNode> = {
  info: <Info className="size-4" aria-hidden />,
  positive: <CircleCheck className="size-4" aria-hidden />,
  warning: <TriangleAlert className="size-4" aria-hidden />,
  negative: <CircleAlert className="size-4" aria-hidden />,
};

export function Callout({ tone = "info", title, children, className, action }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div role={tone === "negative" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border-l-[3px] px-4 py-3 text-sm", styles[tone], className)}>
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
