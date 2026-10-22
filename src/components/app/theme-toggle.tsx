"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

const NEXT: Record<string, string> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<string, string> = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };

export function ThemeToggle({ theme, action, className }: { theme: string; action: (fd: FormData) => Promise<void>; className?: string }) {
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <form action={action} className={cn("inline-grid", className)}>
      <input type="hidden" name="theme" value={NEXT[theme] ?? "system"} />
      <button aria-label={`${LABEL[theme] ?? LABEL.system}. Alternar tema`} title={LABEL[theme]} className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink">
        <Icon className="size-5" />
      </button>
    </form>
  );
}
