"use client";

import { clearOfflinePages } from "@/lib/offline-queue";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { ThemeChoice, type Theme } from "./theme-toggle";

/**
 * Menu do perfil na barra superior: nome e e-mail, configurações, tema e sair num lugar só,
 * em vez de botões soltos ao lado do avatar.
 */
export function ProfileMenu({
  userName,
  userEmail,
  theme,
  setThemeAction,
  logoutAction,
  className,
}: {
  userName: string;
  userEmail: string;
  theme: string;
  setThemeAction: (theme: Theme) => Promise<void>;
  logoutAction: () => Promise<void>;
  className?: string;
}) {
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
        aria-label="Perfil, tema e sair"
        aria-haspopup="menu"
        aria-expanded={open}
        title={userName}
        onClick={() => setOpen((v) => !v)}
        className={cn("rounded-full transition hover:opacity-90", open && "ring-2 ring-accent ring-offset-2 ring-offset-canvas")}
      >
        <Avatar name={userName} size={38} />
      </button>
      {open ? (
        <div role="menu" aria-label="Perfil" className="absolute right-0 z-50 mt-2 w-72 animate-rise rounded-xl border border-line bg-surface p-2 text-ink shadow-[var(--shadow-pop)]">
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="truncate font-medium">{userName}</p>
            <p className="truncate text-xs text-muted">{userEmail}</p>
          </div>
          <Link role="menuitem" href="/configuracoes" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-2">
            <UserRound className="size-[18px] text-muted" strokeWidth={1.8} />
            Meu perfil e configurações
          </Link>
          <div className="px-3 pb-3 pt-1">
            <p className="mb-1.5 text-xs text-muted">Tema</p>
            <ThemeChoice theme={theme} action={setThemeAction} />
          </div>
          <form action={logoutAction} onSubmit={() => void clearOfflinePages()} className="border-t border-line pt-1">
            <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-negative hover:bg-surface-2">
              <LogOut className="size-[18px]" strokeWidth={1.8} />
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
