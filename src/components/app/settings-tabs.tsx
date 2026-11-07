"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BrainCircuit, ChartLine, ChevronLeft, ChevronRight, ShieldCheck, Smile, Tag, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/configuracoes", label: "Geral", mobile: { href: "/configuracoes/perfil", label: "Perfil", hint: "Nome, e-mail e preferências", icon: UserRound } },
  { href: "/configuracoes/mascote", label: "Seu banqueiro", mobile: { hint: "Expressões e jeito de falar", icon: Smile } },
  { href: "/configuracoes/briefing", label: "Meu perfil financeiro", mobile: { hint: "Renda, família e objetivos", icon: ChartLine } },
  { href: "/configuracoes/memoria", label: "Memória do assistente", mobile: { hint: "O que ele lembra sobre você", icon: BrainCircuit } },
  { href: "/configuracoes/categorias", label: "Categorias", mobile: { hint: "Nomes, essenciais e arquivadas", icon: Tag } },
  { href: "/configuracoes/notificacoes", label: "Notificações", mobile: { hint: "Celular, e-mail e resumo semanal", icon: Bell } },
  { href: "/configuracoes/privacidade", label: "Privacidade e segurança", mobile: { hint: "Senha, acessos e seus dados", icon: ShieldCheck } },
];

/** Celular: lista de seções no lugar das abas (como os ajustes do aparelho) e um "voltar" nas seções. */
function MobileSettingsNav({ pathname }: { pathname: string }) {
  if (pathname === "/configuracoes") {
    return (
      <nav aria-label="Seções de configurações" className="sm:hidden">
        <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {TABS.map((t, i) => {
            const Icon = t.mobile.icon;
            return (
              <li key={t.href} className={cn(i > 0 && "border-t border-line")}>
                <Link href={"href" in t.mobile && t.mobile.href ? t.mobile.href : t.href} className="flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-surface-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-link">
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{"label" in t.mobile && t.mobile.label ? t.mobile.label : t.label}</span>
                    <span className="block text-sm text-muted">{t.mobile.hint}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }
  return (
    <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-medium text-link sm:hidden">
      <ChevronLeft className="size-4" />
      Todas as configurações
    </Link>
  );
}

const FADE = "2rem";

export function SettingsTabs() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    // A aba atual aparece mesmo quando a lista não cabe na tela (ex.: Privacidade no celular).
    el.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center" });
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  // Esmaece só a borda que ainda tem abas escondidas.
  const mask = edges.left || edges.right ? `linear-gradient(to right, ${edges.left ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${edges.right ? "transparent" : "#000"})` : undefined;

  return (
    <>
    <MobileSettingsNav pathname={pathname} />
    <nav ref={nav} aria-label="Seções de configurações" className="-mx-4 hidden overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:block sm:px-0" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href === "/configuracoes" && pathname === "/configuracoes/perfil");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition", active ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
    </>
  );
}
