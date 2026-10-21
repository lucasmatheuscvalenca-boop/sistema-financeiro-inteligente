import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MascotArt } from "@/components/mascots/mascot-art";
import type { MascotId, MascotState } from "@/mascots/catalog";

function Leaf() {
  return (
    <svg viewBox="0 0 60 120" className="h-28 w-14 shrink-0 text-petrol-400/70 dark:text-petrol-300/40" aria-hidden>
      <path d="M30 118 C30 80 30 40 32 4" stroke="currentColor" strokeWidth="2.5" fill="none" />
      {[20, 34, 48, 62, 76, 90].map((y, i) => (
        <g key={y} fill="currentColor">
          <ellipse cx={i % 2 ? 42 : 18} cy={y} rx="12" ry="5" transform={`rotate(${i % 2 ? -30 : 30} ${i % 2 ? 42 : 18} ${y})`} />
        </g>
      ))}
    </svg>
  );
}

/** Abertura do painel: mascote com uma mensagem calculada a partir dos dados. */
export function DashboardHero({ mascotId, state, headline, message, href, linkLabel }: { mascotId: MascotId; state: MascotState; headline: string; message: string; href: string; linkLabel: string }) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-gradient-to-r from-hero via-hero to-surface-2 shadow-[var(--shadow-card)]">
      <div className="flex flex-col items-center gap-2 px-4 pt-4 sm:flex-row sm:items-end sm:gap-4 sm:px-6 sm:pt-0">
        <div className="hidden items-end sm:flex">
          <Leaf />
        </div>
        <MascotArt id={mascotId} state={state} size={148} priority animate className="-mb-px shrink-0 sm:mt-3" />
        <div className="relative mb-4 w-full flex-1 sm:mb-6 sm:mt-6">
          <div className="relative rounded-2xl border border-white/70 bg-white/70 px-5 py-4 pr-16 backdrop-blur-sm dark:border-white/10 dark:bg-navy-950/40">
            <span className="absolute -top-2 left-8 size-4 rotate-45 border-l border-t border-white/70 bg-white/70 sm:-left-2 sm:top-1/2 sm:-translate-y-1/2 sm:-rotate-45 dark:border-white/10 dark:bg-navy-950/40" aria-hidden />
            <p className="font-semibold">{headline}</p>
            <p className="mt-1 text-sm text-muted sm:text-base">{message}</p>
            <Link
              href={href}
              aria-label={linkLabel}
              title={linkLabel}
              className="absolute right-4 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-navy-900 text-white shadow-md transition hover:scale-105 hover:bg-navy-800 dark:bg-accent dark:text-accent-ink"
            >
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
