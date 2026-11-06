import Link from "next/link";
import type { ReactNode } from "react";
import { Silk } from "@/components/app/silk";
import { MascotArt } from "@/components/mascots/mascot-art";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Painel de marca: verde profundo com a textura, promessa em serifa, um filete dourado. */}
      <aside className="silk relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Silk />
        <Link href="/" className="relative">
          <Logo inverted tagline />
        </Link>
        <div className="relative">
          <span className="gold-rule mb-6 block h-[3px] w-16" aria-hidden />
          <p className="font-display text-[44px] font-medium leading-[1.08] tracking-[-0.01em]">
            Decisões claras hoje, <span className="text-gold-300">liberdade</span> amanhã.
          </p>
          <p className="mt-5 max-w-md text-white/75">Central financeira, metas, reserva, aposentadoria e um assistente que entende seus números, com O Banqueiro explicando cada passo.</p>
          <div className="mt-10 flex items-end gap-4">
            <MascotArt state="guidance" size={120} decorative />
            <p className="max-w-xs pb-3 text-sm text-white/70">
              <span className="block font-display text-base font-medium text-white">O Banqueiro</span>
              Seu consultor financeiro pessoal, todos os dias.
            </p>
          </div>
        </div>
        <p className="relative text-xs text-white/60">Seus dados financeiros são privados e isolados por conta.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md md:max-w-lg lg:max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" aria-label="Meu Banqueiro — início">
              <Logo tagline />
            </Link>
          </div>
          {/* Tablet em pé: a promessa e os personagens ocupam o topo, e o formulário vira um cartão, em vez de flutuar numa tela vazia. */}
          <div className="mb-6 hidden md:block lg:hidden">
            <p className="font-display text-[28px] font-medium leading-tight">
              Decisões claras hoje, <span className="text-link">liberdade</span> amanhã.
            </p>
            <div className="mt-4 flex items-end gap-3">
              <MascotArt state="guidance" size={72} decorative />
              <p className="pb-2 text-sm text-muted">O Banqueiro, seu consultor financeiro pessoal.</p>
            </div>
          </div>
          <div className="md:rounded-xl md:border md:border-line md:bg-surface md:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
