"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MascotArt } from "@/components/mascots/mascot-art";
import type { MascotId, MascotState } from "@/mascots/catalog";
import { cn } from "@/lib/cn";

export type ToastTone = "positive" | "negative" | "info" | "celebration";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem extends Required<Pick<ToastInput, "title" | "tone">> {
  id: number;
  description?: string;
}

const MASCOT_STATE: Record<ToastTone, MascotState> = {
  positive: "guidance",
  info: "analysis",
  negative: "alert",
  celebration: "celebration",
};

const TONE_CLASS: Record<ToastTone, string> = {
  positive: "border-l-petrol-500",
  info: "border-l-navy-400",
  negative: "border-l-red-500",
  celebration: "border-l-gold-500",
};

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Dispara uma notificação contextual (confirmação de salvamento, conquista, erro). */
export function useToast() {
  return useContext(ToastContext);
}

function ToastCard({ t, mascotId, onClose }: { t: ToastItem; mascotId: MascotId | null; onClose: (id: number) => void }) {
  useEffect(() => {
    const ms = t.tone === "celebration" ? 7000 : t.tone === "negative" ? 6000 : 4500;
    const timer = window.setTimeout(() => onClose(t.id), ms);
    return () => window.clearTimeout(timer);
  }, [t.id, t.tone, onClose]);
  return (
    <li
      role={t.tone === "negative" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full animate-rise items-center gap-3 rounded-2xl border border-l-4 border-line bg-surface p-3 pr-2 text-sm shadow-[var(--shadow-pop)]",
        TONE_CLASS[t.tone],
      )}
    >
      {mascotId ? <MascotArt id={mascotId} state={MASCOT_STATE[t.tone]} size={44} decorative animate={t.tone === "celebration"} /> : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{t.title}</p>
        {t.description ? <p className="mt-0.5 text-muted">{t.description}</p> : null}
      </div>
      <button type="button" onClick={() => onClose(t.id)} aria-label="Fechar notificação" className="self-start rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-ink">
        <X className="size-4" />
      </button>
    </li>
  );
}

export function ToastProvider({ children, mascotId }: { children: ReactNode; mascotId: MascotId | null }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: ToastInput) => {
    seq.current += 1;
    const item: ToastItem = { id: seq.current, title: t.title, description: t.description, tone: t.tone ?? "positive" };
    setItems((cur) => [...cur.slice(-2), item]);
  }, []);
  const remove = useCallback((id: number) => setItems((cur) => cur.filter((x) => x.id !== id)), []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <ol
        aria-live="polite"
        aria-label="Avisos recentes"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[60] mx-auto flex max-w-sm flex-col gap-2 lg:inset-x-auto lg:bottom-6 lg:right-6"
      >
        {items.map((t) => (
          <ToastCard key={t.id} t={t} mascotId={mascotId} onClose={remove} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}
