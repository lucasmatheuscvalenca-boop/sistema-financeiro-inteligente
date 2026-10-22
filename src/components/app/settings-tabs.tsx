"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/configuracoes", label: "Geral" },
  { href: "/configuracoes/mascote", label: "Meu mascote" },
  { href: "/configuracoes/briefing", label: "Meu perfil financeiro" },
  { href: "/configuracoes/memoria", label: "Memória do assistente" },
  { href: "/configuracoes/categorias", label: "Categorias" },
  { href: "/configuracoes/privacidade", label: "Privacidade e segurança" },
];

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
    <nav ref={nav} aria-label="Seções de configurações" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition", active ? "border-petrol-500 font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
