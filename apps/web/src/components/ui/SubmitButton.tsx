"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-navy-950 transition hover:brightness-110 disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-navy-600 bg-navy-800 px-3 py-2 text-sm font-medium text-ink transition hover:border-[var(--accent)] disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted transition hover:bg-navy-800 hover:text-ink disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-md border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60",
} as const;

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn(buttonStyles[variant], className)}>
      {pending ? (pendingLabel ?? "Salvando…") : children}
    </button>
  );
}
