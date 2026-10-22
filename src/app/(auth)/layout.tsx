import Link from "next/link";
import type { ReactNode } from "react";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Logo } from "@/components/app/logo";

const MASCOT_IDS = ["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"] as const;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-petrol-600/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-gold-500/15 blur-3xl" aria-hidden />
        <Link href="/" className="relative">
          <Logo inverted tagline />
        </Link>
        <div className="relative">
          <p className="text-4xl font-bold leading-tight tracking-tight">
            Decisões claras hoje, <span className="text-petrol-300">liberdade</span> amanhã.
          </p>
          <p className="mt-4 max-w-md text-white/75">Central financeira, metas, reserva, aposentadoria e uma IA que entende seus números — com o personagem que combina com você.</p>
          <div className="mt-8 grid max-w-lg grid-cols-6 gap-2">
            {MASCOT_IDS.map((id) => (
              <div key={id} className="flex justify-center rounded-2xl bg-white/5 pt-2 ring-1 ring-white/10">
                <MascotArt id={id} size={64} decorative />
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/60">Seus dados financeiros são privados e isolados por conta.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md md:max-w-lg lg:max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" aria-label="NEXO — início">
              <Logo tagline />
            </Link>
          </div>
          {/* Tablet em pé: a promessa e os personagens ocupam o topo, e o formulário vira um cartão, em vez de flutuar numa tela vazia. */}
          <div className="mb-6 hidden md:block lg:hidden">
            <p className="text-2xl font-bold leading-tight tracking-tight">
              Decisões claras hoje, <span className="text-link">liberdade</span> amanhã.
            </p>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {MASCOT_IDS.map((id) => (
                <div key={id} className="flex justify-center rounded-2xl bg-surface pt-2 ring-1 ring-line">
                  <MascotArt id={id} size={56} decorative />
                </div>
              ))}
            </div>
          </div>
          <div className="md:rounded-3xl md:border md:border-line md:bg-surface md:p-8 md:shadow-[var(--shadow-card)] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">{children}</div>
        </div>
      </main>
    </div>
  );
}
