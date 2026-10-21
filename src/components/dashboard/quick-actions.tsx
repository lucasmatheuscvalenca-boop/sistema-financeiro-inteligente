import Link from "next/link";
import { ChartColumnBig, CircleHelp, CirclePlus, Target } from "lucide-react";

const ACTIONS = [
  { href: "/movimentacoes?nova=1", label: "Nova transação", icon: CirclePlus },
  { href: "/posso-gastar", label: "Posso gastar?", icon: CircleHelp },
  { href: "/metas/nova", label: "Criar meta", icon: Target },
  { href: "/relatorios", label: "Ver relatórios", icon: ChartColumnBig },
];

/** Ações rápidas (no celular, logo abaixo do saldo). */
export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ACTIONS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="card-hover flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center text-sm font-medium shadow-[var(--shadow-card)]">
          <span className="grid size-10 place-items-center rounded-full border border-petrol-200 text-petrol-600 dark:border-petrol-700 dark:text-petrol-300">
            <Icon className="size-5" strokeWidth={1.8} />
          </span>
          {label}
        </Link>
      ))}
    </div>
  );
}
