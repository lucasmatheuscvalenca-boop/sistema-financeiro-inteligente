"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export type Theme = "system" | "light" | "dark";

/** Mesmo nome lido pelo servidor (THEME_COOKIE), para a próxima página já vir no tema certo. */
const COOKIE = "rumo_theme";

// Estado compartilhado entre os seletores de tema (menu do perfil e menu Mais do celular).
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
export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=${365 * 86_400}; samesite=lax`;
  current = theme;
  listeners.forEach((fn) => fn());
}

/** Sem interface: no modo "sistema", acompanha a troca de claro/escuro feita no aparelho. */
export function ThemeSync({ theme }: { theme: string }) {
  const initial = asTheme(theme);
  const active = useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial,
  );
  useEffect(() => {
    if (active !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.classList.toggle("dark", mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [active]);
  return null;
}

const CHOICES: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

/** As três opções de tema lado a lado (menu do perfil). Mesmo estado do botão de tema. */
export function ThemeChoice({ theme, action, className }: { theme: string; action: (theme: Theme) => Promise<void>; className?: string }) {
  const initial = asTheme(theme);
  const active = useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial,
  );
  return (
    <div role="radiogroup" aria-label="Tema" className={cn("grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1", className)}>
      {CHOICES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={active === value}
          onClick={() => {
            if (active === value) return;
            applyTheme(value);
            void action(value).catch(() => {});
          }}
          className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition", active === value ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
