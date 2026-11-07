import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { OfflineQuickAdd } from "@/components/app/offline-quick-add";

export const metadata: Metadata = { title: "Sem internet" };
export const dynamic = "force-static";

/** Mostrada pelo service worker quando não há internet nem cópia da tela pedida. */
export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-surface-2">
          <WifiOff className="size-5 text-link" aria-hidden />
        </span>
        <h1 className="font-display text-3xl">Sem internet</h1>
      </div>
      <p className="mt-3 text-muted">As telas que você já abriu continuam disponíveis com os últimos números. Gastos anotados aqui ficam no aparelho e entram nos lançamentos quando a conexão voltar.</p>
      <section className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="mb-3 text-lg">Anotar um gasto</h2>
        <OfflineQuickAdd />
      </section>
      <p className="mt-6 text-sm">
        <Link href="/painel" className="text-link underline">
          Tentar abrir o Início
        </Link>
      </p>
    </main>
  );
}
