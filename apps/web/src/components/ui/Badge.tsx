import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "personal" | "business" | "signal" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "border-navy-600 text-muted",
    personal: "border-personal/50 text-personal",
    business: "border-business/50 text-business",
    signal: "border-signal/50 text-signal",
    warn: "border-warn/50 text-warn",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-pixel text-[11px] uppercase leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
