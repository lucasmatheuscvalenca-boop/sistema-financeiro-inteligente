"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { plural } from "@/domain/text";

export interface ShellAlert {
  id: string;
  title: string;
  cause: string;
  severity: string;
  href: string;
}

const SEV: Record<string, { icon: typeof Info; className: string }> = {
  important: { icon: CircleAlert, className: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  attention: { icon: TriangleAlert, className: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  info: { icon: Info, className: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200" },
};

/** Sino com a lista das notificações ativas (alertas gerados pelo motor financeiro). */
export function NotificationsMenu({ alerts, count, className }: { alerts: ShellAlert[]; count: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={`Notificações (${count})`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="size-5" />
        {count ? <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500 ring-2 ring-canvas" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notificações</p>
            <span className="text-xs text-muted">{plural(count, "ativa", "ativas")}</span>
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Tudo em dia. Nenhuma notificação ativa.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {alerts.map((a) => {
                const sev = SEV[a.severity] ?? SEV.info!;
                const Icon = sev.icon;
                return (
                  <li key={a.id}>
                    <Link href={a.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 transition hover:bg-surface-2">
                      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", sev.className)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="line-clamp-2 text-xs text-muted">{a.cause}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/alertas" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-link hover:bg-surface-2">
            Ver todas
          </Link>
        </div>
      ) : null}
    </div>
  );
}
