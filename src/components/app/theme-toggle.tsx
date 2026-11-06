"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

type Theme = "system" | "light" | "dark";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };
/** Mesmo nome lido pelo servidor (THEME_COOKIE), para a próxima página já vir no tema certo. */
const COOKIE = "rumo_theme";

// Estado compartilhado entre os botões de tema (barra do topo e menu do celular).
let current: Theme | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

function asTheme(v: string): Theme {
  return v === "light" || v === "dark" ? v : "system";
}

/** Aplica o tema na hora: classe no <html>, cookie para as próximas páginas e aviso aos botões. */
function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=${365 * 86_400}; samesite=lax`;
  current = theme;
  listeners.forEach((fn) => fn());
}

/**
 * Alterna sistema → claro → escuro. A troca de cores acontece no navegador, sem esperar o
 * servidor; a preferência é salva na conta em segundo plano (vale em outros aparelhos).
 */
export function ThemeToggle({ theme, action, className }: { theme: string; action: (theme: Theme) => Promise<void>; className?: string }) {
  const initial = asTheme(theme);
  const active = useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial,
  );

  // No modo "sistema", acompanha a troca de claro/escuro feita no aparelho.
  useEffect(() => {
    if (active !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.classList.toggle("dark", mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [active]);

  const Icon = active === "dark" ? Moon : active === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[active];
        applyTheme(next);
        void action(next).catch(() => {});
      }}
      aria-label={`${LABEL[active]}. Alternar tema`}
      title={LABEL[active]}
      className={cn("grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink", className)}
    >
      <Icon className="size-5" />
    </button>
  );
}
