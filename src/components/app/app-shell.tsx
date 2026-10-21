"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Bell,
  CalendarCheck,
  ChartLine,
  CircleHelp,
  Landmark,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Repeat,
  Scale,
  Settings,
  ShieldCheck,
  Sunset,
  Target,
  Trophy,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { MascotId } from "@/mascots/catalog";
import { cn } from "@/lib/cn";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Logo } from "./logo";
import { MOBILE_TABS, NAV_SECTIONS, type NavItem } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ArrowLeftRight,
  Bell,
  CalendarCheck,
  ChartLine,
  CircleHelp,
  Landmark,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Repeat,
  Scale,
  Settings,
  ShieldCheck,
  Sunset,
  Target,
  Trophy,
  Upload,
  Users,
  Wallet,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, badge, onNavigate }: { item: NavItem; pathname: string; badge?: number; onNavigate?: () => void }) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
        active ? "bg-navy-900 font-medium text-white dark:bg-petrol-400 dark:text-navy-950" : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {badge ? <span className="ml-auto rounded-full bg-orange-600 px-1.5 text-[11px] font-semibold text-white">{badge}</span> : null}
    </Link>
  );
}

export function AppShell({
  children,
  userName,
  mascotId,
  alertCount,
  theme,
  logoutAction,
  setThemeAction,
}: {
  children: ReactNode;
  userName: string;
  mascotId: MascotId;
  alertCount: number;
  theme: string;
  logoutAction: () => Promise<void>;
  setThemeAction: (fd: FormData) => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (onNavigate?: () => void) => (
    <nav aria-label="Navegação principal" className="space-y-5">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/80">{section.title}</p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} badge={item.href === "/alertas" ? alertCount : undefined} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:h-dvh lg:flex-col lg:sticky lg:top-0">
        <div className="px-5 py-5">
          <Link href="/painel" aria-label="Rumo — painel">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">{nav()}</div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <MascotArt id={mascotId} size={40} decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{userName}</p>
            <Link href="/configuracoes/mascote" className="text-xs text-muted hover:underline">
              Meu mascote
            </Link>
          </div>
          <form action={logoutAction}>
            <button aria-label="Sair" title="Sair" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-surface-2">
              <Menu className="size-5" />
            </button>
            <Link href="/painel">
              <Logo compact />
            </Link>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1.5">
            <Link href="/alertas" aria-label={`Alertas (${alertCount})`} className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <Bell className="size-5" />
              {alertCount ? <span className="absolute right-1 top-1 size-2 rounded-full bg-orange-600" /> : null}
            </Link>
            <ThemeToggle theme={theme} action={setThemeAction} />
            <Link href="/configuracoes/mascote" className="lg:hidden" aria-label="Meu mascote">
              <MascotArt id={mascotId} size={34} decorative />
            </Link>
          </div>
        </header>

        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-surface shadow-[var(--shadow-pop)]">
              <div className="flex items-center justify-between px-4 py-4">
                <Logo />
                <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-surface-2">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">{nav(() => setOpen(false))}</div>
              <form action={logoutAction} className="border-t border-line p-3">
                <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2">
                  <LogOut className="size-4" /> Sair
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>

        <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE_TABS.map((item) => {
            const Icon = ICONS[item.icon] ?? LayoutDashboard;
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-petrol-600 dark:text-petrol-300" : "text-muted")}>
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
