"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Ellipsis, LogOut, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import type { MascotId } from "@/mascots/catalog";
import { BanqueiroMascot } from "@/components/mascots/banqueiro-mascot";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { Logo, LogoMark } from "./logo";
import { isActivePath, MAIN_NAV, MOBILE_TABS, MORE_SECTIONS, SIDEBAR_MORE, type NavItem } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";
import { NotificationsMenu, type ShellAlert } from "./notifications-menu";
import { SearchBox } from "./search-box";
import { SIDEBAR_COOKIE, SIDEBAR_RECOLHIDA } from "./sidebar-state";
import { ThemeToggle } from "./theme-toggle";
import { ToastProvider } from "@/components/ui/toast";

function SidebarLink({ item, pathname, badge, collapsed }: { item: NavItem; pathname: string; badge?: number; collapsed: boolean }) {
  const Icon = NAV_ICONS[item.icon]!;
  const active = isActivePath(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "bg-leaf-700/75 font-medium text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-white" : "text-white/65 group-hover:text-white/90")} strokeWidth={1.7} />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
      {badge ? (
        collapsed ? (
          <span className="absolute right-3 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-forest-900" aria-label={`${badge} novas`} />
        ) : (
          <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{badge}</span>
        )
      ) : null}
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
  sidebarCollapsed = false,
}: {
  children: ReactNode;
  userName: string;
  mascotId: MascotId;
  alertCount: number;
  alerts: ShellAlert[];
  theme: string;
  logoutAction: () => Promise<void>;
  setThemeAction: (fd: FormData) => Promise<void>;
  /** Estado salvo da barra lateral do computador (cookie lido no servidor). */
  sidebarCollapsed?: boolean;
}) {
  const pathname = usePathname();
  // O menu “Mais” fica aberto só na rota em que foi aberto: navegar fecha sem precisar de efeito.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const moreOpen = openAt === pathname;
  const setMoreOpen = (open: boolean) => setOpenAt(open ? pathname : null);
  // Na barra lateral, "Mais" é um item só; abre a lista do que não cabe nas quatro abas.
  const inMore = SIDEBAR_MORE.some((item) => isActivePath(pathname, item));
  const [sideMore, setSideMore] = useState(inMore);
  const sideMoreOpen = sideMore || inMore;
  // Barra lateral do computador: fixa na tela; recolhida mostra só os ícones e libera espaço para o conteúdo.
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      document.cookie = `${SIDEBAR_COOKIE}=${next ? SIDEBAR_RECOLHIDA : "aberta"}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
  };

  return (
    <ToastProvider mascotId={mascotId}>
    <div className="min-h-dvh" data-mascot={mascotId} data-barra={collapsed ? "recolhida" : "aberta"}>
      {/* Barra lateral (computador e telas largas): fixa na tela, verde profundo com a textura da marca. */}
      <aside
        id="barra-lateral"
        aria-label="Barra lateral"
        className={cn("silk fixed inset-y-0 left-0 z-40 hidden flex-col text-white transition-[width] duration-200 ease-out lg:flex", collapsed ? "w-[76px]" : "w-[248px]")}
      >
        <div className={cn("flex shrink-0", collapsed ? "flex-col items-center gap-3 px-2 pb-6 pt-6" : "items-start justify-between gap-2 pb-8 pl-6 pr-3 pt-7")}>
          <Link href="/painel" aria-label="Meu Banqueiro — início" className="inline-block">
            {collapsed ? <LogoMark /> : <Logo inverted stacked />}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-controls="barra-lateral"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Abrir barra lateral" : "Recolher barra lateral"}
            title={collapsed ? "Abrir barra lateral" : "Recolher barra lateral"}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.7} /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.7} />}
          </button>
        </div>
        <nav aria-label="Navegação principal" className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3">
          {MAIN_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
          <button
            type="button"
            onClick={() => setSideMore((v) => !v)}
            aria-expanded={sideMoreOpen}
            aria-controls="sidebar-mais"
            title={collapsed ? "Mais" : undefined}
            className={cn(
              "group relative flex w-full items-center gap-3 rounded-lg py-2.5 text-sm transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
              inMore ? "font-medium text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
            )}
          >
            <Ellipsis className="size-[18px] shrink-0 text-white/65 group-hover:text-white/90" strokeWidth={1.7} />
            <span className={cn("flex-1 text-left", collapsed && "sr-only")}>Mais</span>
            {alertCount && !sideMoreOpen ? (
              collapsed ? (
                <span className="absolute right-3 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-forest-900" aria-label={`${alertCount} notificações`} />
              ) : (
                <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{alertCount}</span>
              )
            ) : null}
          </button>
          {sideMoreOpen ? (
            <div id="sidebar-mais" className={cn("space-y-1", collapsed ? "border-t border-white/10 pt-1" : "ml-5 border-l border-white/10 pl-2")}>
              {SIDEBAR_MORE.map((item) => (
                <SidebarLink key={item.href} item={item} pathname={pathname} badge={item.href === "/alertas" ? alertCount : undefined} collapsed={collapsed} />
              ))}
            </div>
          ) : null}
        </nav>
        {/* Área do consultor: o Banqueiro mora aqui, discreto, e leva ao assistente. */}
        <Link
          href="/assistente"
          title={collapsed ? "Seu consultor digital" : undefined}
          className={cn("mb-5 flex shrink-0 items-center gap-3 border-t border-white/10 pt-4 transition hover:opacity-90", collapsed ? "mx-3 justify-center" : "mx-4 px-2")}
        >
          <BanqueiroMascot avatar="dourado" largura={collapsed ? 40 : 46} altura={collapsed ? 40 : 46} decorativo />
          <span className={cn("min-w-0 whitespace-nowrap text-sm leading-tight text-white/90", collapsed && "sr-only")}>
            Seu consultor
            <br />
            digital
          </span>
        </Link>
      </aside>

      <div className={cn("min-w-0 transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]")}>
        {/* Barra superior */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur lg:border-transparent">
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
            <Link href="/painel" className="lg:hidden" aria-label="Meu Banqueiro — início">
              <Logo />
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <Link href="/busca" aria-label="Buscar" title="Buscar" className="hidden size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink lg:grid">
                <Search className="size-5" />
              </Link>
              <ThemeToggle theme={theme} action={setThemeAction} className="hidden sm:inline-grid" />
              <NotificationsMenu alerts={alerts} count={alertCount} />
              {/* O avatar do kit já tem o fundo circular: claro no tema claro, escuro no escuro. */}
              <Link href="/assistente" aria-label="Conversar com o assistente" title="Conversar com O Banqueiro" className="ml-1 grid shrink-0 place-items-center rounded-full transition hover:opacity-90">
                <BanqueiroMascot avatar="claro" largura={40} altura={40} decorativo className="dark:hidden" />
                <BanqueiroMascot avatar="escuro" largura={40} altura={40} decorativo className="hidden dark:inline-flex" />
              </Link>
              <Link href="/configuracoes" aria-label="Perfil e configurações" title={userName} className="ml-1 hidden rounded-full transition hover:opacity-90 lg:block">
                <Avatar name={userName} size={38} />
              </Link>
              <form action={logoutAction} className="hidden lg:block">
                <button aria-label="Sair" title="Sair" className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink">
                  <LogOut className="size-[18px]" />
                </button>
              </form>
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
            <div className="absolute inset-0 animate-fade bg-forest-950/60" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-rise overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[var(--shadow-pop)]">
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
                          className={cn("flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs transition", active ? "border-accent bg-leaf-50 text-link dark:bg-forest-800" : "border-line hover:bg-surface-2")}
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
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-3 text-sm text-muted hover:bg-surface-2">
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
