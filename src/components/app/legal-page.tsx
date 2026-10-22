import Link from "next/link";
import { Logo } from "@/components/app/logo";

export type LegalSection = [title: string, items: string[]];

/** Página pública de texto (termos, privacidade): marca, título, aviso e seções em lista. */
export function LegalPage({ title, intro, updated, sections }: { title: string; intro: string; updated: string; sections: LegalSection[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/" aria-label="Página inicial">
        <Logo />
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{intro}</p>
      <p className="mt-2 text-xs text-muted">Versão de {updated}</p>
      <div className="mt-8 space-y-8">
        {sections.map(([heading, items]) => (
          <section key={heading}>
            <h2 className="text-lg font-semibold">{heading}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <nav aria-label="Documentos" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm">
        <Link href="/termos" className="text-link underline-offset-4 hover:underline">
          Termos de uso
        </Link>
        <Link href="/privacidade" className="text-link underline-offset-4 hover:underline">
          Aviso de privacidade
        </Link>
        <Link href="/" className="text-link underline-offset-4 hover:underline">
          Página inicial
        </Link>
      </nav>
    </div>
  );
}
