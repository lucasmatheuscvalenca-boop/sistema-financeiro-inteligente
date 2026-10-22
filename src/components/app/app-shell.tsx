"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Ellipsis, LogOut, MessageCircle, X } from "lucide-react";
import type { MascotId } from "@/mascots/catalog";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { Logo } from "./logo";
import { isActivePath, MAIN_NAV, MOBILE_TABS, MORE_SECTIONS, SECONDARY_NAV, type NavItem } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";
import { NotificationsMenu, type ShellAlert } from "./notifications-menu";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { ToastProvider } from "@/components/ui/toast";

function SidebarLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge?: number }) {
  const Icon = NAV_ICONS[item.icon]!;
  const active = isActivePath(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active ? "bg-white/10 font-medium text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]" : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-petrol-300" : "text-white/60 group-hover:text-white/90")} strokeWidth={1.8} />
      <span className="truncate">{item.label}</span>
      {badge ? <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{badge}</span> : null}
    </Link>
  );
}

export function AppShell({
  children,
  userName,
  mascotId,
  alertCount,
  alerts,
  theme,
  logoutAction,
  setThemeAction,
}: {
  children: ReactNode;
  userName: string;
  mascotId: MascotId;
  alertCount: number;
  alerts: ShellAlert[];
  theme: string;
  logoutAction: () => Promise<void>;
  setThemeAction: (fd: FormData) => Promise<void>;
}) {
  const pathname = usePathname();
  // O menu “Mais” fica aberto só na rota em que foi aberto: navegar fecha sem precisar de efeito.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const moreOpen = openAt === pathname;
  const setMoreOpen = (open: boolean) => setOpenAt(open ? pathname : null);
  const firstName = userName.split(/\s+/)[0] ?? userName;

  return (
    <ToastProvider mascotId={mascotId}>
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]" data-mascot={mascotId}>
      {/* Barra lateral (desktop) */}
      <div className="hidden bg-sidebar lg:block dark:border-r dark:border-line">
      <aside className="text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-6 pb-6 pt-7">
          <Link href="/painel" aria-label="NEXO — início">
            <Logo inverted />
          </Link>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto px-3">
          {MAIN_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="space-y-1 px-3 pb-3 pt-4">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} badge={item.href === "/alertas" ? alertCount : undefined} />
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
          <Avatar name={userName} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{firstName}</p>
            <Link href="/configuracoes" className="text-xs text-white/60 hover:text-white hover:underline">
              Ver perfil
            </Link>
          </div>
          <form action={logoutAction}>
            <button aria-label="Sair" title="Sair" className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>
      </div>

      <div className="min-w-0">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur lg:border-transparent">
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
            <Link href="/painel" className="lg:hidden" aria-label="NEXO — início">
              <Logo />
            </Link>
            <SearchBox className="hidden w-full max-w-md lg:block" />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle theme={theme} action={setThemeAction} className="hidden sm:inline-grid" />
              <NotificationsMenu alerts={alerts} count={alertCount} />
              <Link href="/assistente" aria-label="Conversar com o assistente" className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink">
                <MessageCircle className="size-5" />
              </Link>
              <Link href="/configuracoes" aria-label="Perfil e configurações" className="ml-1 hidden rounded-full transition hover:opacity-90 lg:block">
                <Avatar name={userName} size={38} />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-2">{children}</main>

        {/* Barra inferior (celular) */}
        <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {MOBILE_TABS.map((item) => {
              const Icon = NAV_ICONS[item.icon]!;
              const active = isActivePath(pathname, item);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors", active ? "text-link" : "text-muted")}>
                  <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                  {item.label}
                </Link>
              );
            })}
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", moreOpen ? "text-link" : "text-muted")}>
              <Ellipsis className="size-5" />
              Mais
            </button>
          </div>
        </nav>

        {moreOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
            <div className="absolute inset-0 animate-fade bg-navy-950/50" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-rise overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[var(--shadow-pop)]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={userName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{userName}</p>
                  <Link href="/configuracoes" className="text-xs text-link">
                    Ver perfil
                  </Link>
                </div>
                <ThemeToggle theme={theme} action={setThemeAction} />
                <button aria-label="Fechar" onClick={() => setMoreOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-surface-2">
                  <X className="size-5" />
                </button>
              </div>
              <SearchBox className="mb-4" />
              {MORE_SECTIONS.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{section.title}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {section.items.map((item) => {
                      const Icon = NAV_ICONS[item.icon]!;
                      const active = isActivePath(pathname, item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn("flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs transition", active ? "border-petrol-500 bg-petrol-50 text-link dark:bg-petrol-900/30" : "border-line hover:bg-surface-2")}
                        >
                          <Icon className="size-5" strokeWidth={1.8} />
                          {item.label}
                          {item.href === "/alertas" && alertCount ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{alertCount}</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <form action={logoutAction}>
                <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm text-muted hover:bg-surface-2">
                  <LogOut className="size-4" /> Sair
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
    </ToastProvider>
  );
}
