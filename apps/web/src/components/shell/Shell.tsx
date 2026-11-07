"use client";

import { CURRENT_PHASE, NAV_MODULES, UNIVERSE_LABEL, type MemberRole, type WorkspaceKind } from "@myoffice/core";
import { Check, ChevronDown, LogOut, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { NAV_ICONS } from "@/components/icons";
import { cn } from "@/lib/cn";

export interface ShellWorkspace {
  id: string;
  kind: WorkspaceKind;
  name: string;
  role: MemberRole;
}

interface ShellProps {
  workspaces: ShellWorkspace[];
  userName: string;
  userEmail: string | null;
  children: ReactNode;
}

const LAST_WS_KEY = "myoffice:last-workspace";

function workspaceFromPath(pathname: string): string | null {
  const m = /^\/w\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname);
  return m?.[1] ?? null;
}

function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WS_KEY);
  } catch {
    return null;
  }
}

const storeListeners = new Set<() => void>();

function subscribeLastWorkspace(listener: () => void) {
  storeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function rememberWorkspace(id: string) {
  try {
    if (window.localStorage.getItem(LAST_WS_KEY) === id) return;
    window.localStorage.setItem(LAST_WS_KEY, id);
  } catch {
    // Armazenamento indisponível (aba privada etc.): apenas não lembra.
    return;
  }
  storeListeners.forEach((l) => l());
}

export function Shell({ workspaces, userName, userEmail, children }: ShellProps) {
  const pathname = usePathname();
  // A gaveta fica aberta só na página em que foi aberta: navegar a fecha sem efeito colateral.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? pathname : null);

  const pathWs = workspaceFromPath(pathname);
  const remembered = useSyncExternalStore(subscribeLastWorkspace, readLastWorkspace, () => null);
  useEffect(() => {
    if (pathWs) rememberWorkspace(pathWs);
  }, [pathWs]);

  const personal = workspaces.find((w) => w.kind === "personal") ?? workspaces[0]!;
  const current = useMemo(() => {
    const id = pathWs ?? remembered;
    return workspaces.find((w) => w.id === id) ?? personal;
  }, [pathWs, remembered, workspaces, personal]);

  const universe = pathWs ? current.kind : "owner";

  const nav = (
    <SidebarContent
      workspaces={workspaces}
      current={current}
      pathname={pathname}
      userName={userName}
      userEmail={userEmail}
    />
  );

  return (
    <div data-universe={universe} className="min-h-dvh md:grid md:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r-2 border-navy-700 bg-navy-900 md:block">
        {nav}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-navy-700 bg-navy-900/95 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md border border-navy-600 p-2 text-ink"
          aria-label="Abrir menu"
          aria-expanded={drawerOpen}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            className="absolute inset-0 bg-navy-950/70"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs overflow-y-auto border-r-2 border-navy-700 bg-navy-900">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 rounded-md p-2 text-muted hover:text-ink"
              aria-label="Fechar menu"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            {nav}
          </div>
        </div>
      )}

      <div className="office-floor min-h-dvh min-w-0">{children}</div>
    </div>
  );
}

function SidebarContent({
  workspaces,
  current,
  pathname,
  userName,
  userEmail,
}: {
  workspaces: ShellWorkspace[];
  current: ShellWorkspace;
  pathname: string;
  userName: string;
  userEmail: string | null;
}) {
  const wsBase = `/w/${current.id}`;
  const modules = Object.fromEntries(NAV_MODULES.map((m) => [m.key, m]));

  const hrefFor = (key: string) => (modules[key]?.scope === "workspace" ? `${wsBase}/${key}` : `/${key}`);

  const groups: { title: string; keys: string[]; tone?: WorkspaceKind }[] = [
    { title: "Visão do dono", keys: ["escritorio", "comando"] },
    { title: `Universo ${UNIVERSE_LABEL[current.kind].toLowerCase()} · ${current.name}`, keys: ["agentes", "departamentos", "projetos", "tarefas", "memoria", "ferramentas"], tone: current.kind },
    { title: "Controle", keys: ["aprovacoes", "monitoramento", "configuracoes"] },
  ];

  return (
    <nav className="flex min-h-full flex-col gap-5 p-4" aria-label="Navegação principal">
      <Link href="/inicio" className="px-1 pt-1">
        <Logo />
      </Link>

      <UniverseSwitcher workspaces={workspaces} current={current} pathname={pathname} />

      <NavLink href="/inicio" label="Início" icon="inicio" active={pathname === "/inicio"} />

      {groups.map((group) => (
        <div key={group.title} className="space-y-1">
          <p
            className={cn(
              "truncate px-2 pb-1 font-pixel text-[11px] uppercase tracking-wider",
              group.tone === "personal" ? "text-personal" : group.tone === "business" ? "text-business" : "text-faint",
            )}
            title={group.title}
          >
            {group.title}
          </p>
          {group.tone && (
            <NavLink href={wsBase} label="Visão do universo" icon="inicio" active={pathname === wsBase} tone={group.tone} />
          )}
          {group.keys.map((key) => {
            const mod = modules[key]!;
            const href = hrefFor(key);
            return (
              <NavLink
                key={key}
                href={href}
                label={mod.label}
                icon={key}
                active={pathname === href || pathname.startsWith(`${href}/`)}
                phase={mod.phase > CURRENT_PHASE ? mod.phase : undefined}
                tone={group.tone}
              />
            );
          })}
        </div>
      ))}

      <div className="mt-auto space-y-3 border-t-2 border-navy-700 pt-4">
        <div className="px-2">
          <p className="truncate text-sm font-medium" data-testid="user-name">
            {userName}
          </p>
          {userEmail && <p className="truncate text-xs text-faint">{userEmail}</p>}
        </div>
        <form action="/auth/sair" method="post">
          <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-navy-800 hover:text-ink">
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </button>
        </form>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  phase,
  tone,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  phase?: number;
  tone?: WorkspaceKind;
}) {
  const Icon = NAV_ICONS[icon];
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition",
        active ? "bg-navy-700 text-ink" : "text-muted hover:bg-navy-800 hover:text-ink",
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "size-4 shrink-0",
            active && (tone === "personal" ? "text-personal" : tone === "business" ? "text-business" : "text-signal"),
          )}
          aria-hidden="true"
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {phase && (
        <span className="font-pixel text-[10px] text-faint" title={`Disponível a partir da Fase ${phase}`}>
          F{phase}
        </span>
      )}
    </Link>
  );
}

function UniverseSwitcher({
  workspaces,
  current,
  pathname,
}: {
  workspaces: ShellWorkspace[];
  current: ShellWorkspace;
  pathname: string;
}) {
  const router = useRouter();
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

  function switchTo(ws: ShellWorkspace) {
    setOpen(false);
    rememberWorkspace(ws.id);
    // Dentro de um universo, mantém o mesmo módulo ao trocar; fora, abre a visão do universo.
    const sub = /^\/w\/[0-9a-f-]{36}(\/.*)?$/i.exec(pathname)?.[1] ?? "";
    router.push(`/w/${ws.id}${sub}`);
  }

  const personal = workspaces.filter((w) => w.kind === "personal");
  const business = workspaces.filter((w) => w.kind === "business");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="universe-switcher"
        className={cn(
          "pixel-frame flex w-full items-center gap-3 bg-navy-850 px-3 py-2.5 text-left",
          current.kind === "personal" ? "border-personal/60" : "border-business/60",
        )}
      >
        <span
          className={cn("size-3 shrink-0", current.kind === "personal" ? "bg-personal" : "bg-business")}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-pixel text-[11px] uppercase text-faint">Universo {UNIVERSE_LABEL[current.kind]}</span>
          <span className="block truncate text-sm font-semibold" data-testid="current-universe">
            {current.name}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted transition", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div className="pixel-frame absolute inset-x-0 z-50 mt-2 bg-navy-850 p-2" role="listbox" aria-label="Universos">
          {[
            { title: "Pessoal", items: personal },
            { title: "Empresas", items: business },
          ].map((group) =>
            group.items.length ? (
              <div key={group.title} className="mb-1">
                <p className="px-2 py-1 font-pixel text-[10px] uppercase text-faint">{group.title}</p>
                {group.items.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    role="option"
                    aria-selected={ws.id === current.id}
                    onClick={() => switchTo(ws)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-navy-700"
                  >
                    <span className={cn("size-2.5", ws.kind === "personal" ? "bg-personal" : "bg-business")} aria-hidden="true" />
                    <span className="flex-1 truncate">{ws.name}</span>
                    {ws.id === current.id && <Check className="size-4 text-muted" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            ) : null,
          )}
          <Link
            href="/configuracoes#empresas"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted hover:bg-navy-700 hover:text-ink"
          >
            <Plus className="size-4" aria-hidden="true" />
            Adicionar empresa
          </Link>
        </div>
      )}
    </div>
  );
}
