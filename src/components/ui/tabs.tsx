"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Abas acessíveis (setas, Home/End). Os painéis inativos continuam montados e só ficam ocultos,
 * então simulações e gráficos preservam o estado ao trocar de aba.
 */
export function Tabs({ tabs, label, defaultTab, className }: { tabs: TabItem[]; label: string; defaultTab?: string; className?: string }) {
  const base = useId();
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent, idx: number) => {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (idx === last ? 0 : idx + 1) : e.key === "ArrowLeft" ? (idx === 0 ? last : idx - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(tabs[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-line">
        {tabs.map((t, idx) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, idx)}
              className={cn(
                "relative -mb-px whitespace-nowrap border-b-2 py-2.5 text-sm font-medium transition-colors",
                selected ? "border-petrol-500 text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
          className="animate-fade pt-5 focus-visible:outline-none"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
