"use client";

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

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções de configurações" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("block border-b-2 px-3 py-2 text-sm transition", active ? "border-petrol-500 font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
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
