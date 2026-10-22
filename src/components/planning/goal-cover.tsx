import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Capas ilustradas (vetoriais e originais) para cada tipo de projeto. Leves, nítidas em
 * qualquer tamanho e coerentes com a paleta do NEXO.
 */
export type CoverKind = "travel" | "vehicle" | "home" | "wedding" | "education" | "independence" | "retirement" | "other" | "emergency";

type Scene = { sky: [string, string]; body: ReactNode };

const SCENES: Record<CoverKind, (id: string) => Scene> = {
  travel: () => ({
    sky: ["#F7C6B8", "#5B7FB8"],
    body: (
      <>
        <circle cx="120" cy="30" r="12" fill="#FFE7B0" opacity="0.9" />
        <path d="M0 78 L40 52 L62 64 L95 30 L130 58 L160 46 V100 H0 Z" fill="#41608F" />
        <path d="M95 30 L84 41 L90 40 L95 45 L101 40 L106 41 Z" fill="#F4F7FB" />
        <path d="M0 86 C40 74 80 92 160 78 V100 H0 Z" fill="#2B4570" />
        <path d="M18 22 l18 4 -6 2 z" fill="#FFFFFF" opacity="0.9" />
        <path d="M14 23 C30 25 46 22 60 16" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.2" fill="none" strokeDasharray="3 3" />
        {/* Mala de viagem: neutra, serve para qualquer destino. */}
        <g transform="translate(118 54)">
          <rect x="7" y="0" width="10" height="7" rx="2" fill="none" stroke="#5A2E14" strokeWidth="2.2" />
          <rect x="0" y="6" width="24" height="24" rx="3.5" fill="#E8833A" />
          <rect x="5" y="6" width="2.5" height="24" fill="#C46420" />
          <rect x="16.5" y="6" width="2.5" height="24" fill="#C46420" />
          <circle cx="5" cy="31.5" r="2" fill="#0B1F3B" />
          <circle cx="19" cy="31.5" r="2" fill="#0B1F3B" />
        </g>
      </>
    ),
  }),
  vehicle: () => ({
    sky: ["#FFD7A8", "#E9775A"],
    body: (
      <>
        <circle cx="80" cy="48" r="18" fill="#FFE9B8" />
        <path d="M0 58 H160 V100 H0 Z" fill="#3B3F58" />
        <path d="M74 58 L64 100 H96 L86 58 Z" fill="#545A7A" />
        <path d="M79 80 h2 v6 h-2 z M78.5 90 h3 v8 h-3 z" fill="#FFE9B8" />
        <g transform="translate(36 40)">
          <path d="M6 22 C6 14 12 12 20 11 L30 4 C33 2 38 2 44 2 H56 C62 2 66 6 70 11 L78 13 C82 14 84 17 84 21 V26 H6 Z" fill="#0EA5A5" />
          <path d="M33 6 H44 V12 H26 Z M48 6 H56 C59 6 62 8 64 12 H48 Z" fill="#CFF2F2" />
          <circle cx="24" cy="26" r="7" fill="#0B1F3B" />
          <circle cx="66" cy="26" r="7" fill="#0B1F3B" />
          <circle cx="24" cy="26" r="2.6" fill="#94A3B8" />
          <circle cx="66" cy="26" r="2.6" fill="#94A3B8" />
        </g>
      </>
    ),
  }),
  home: () => ({
    sky: ["#203A63", "#0B1F3B"],
    body: (
      <>
        <circle cx="128" cy="22" r="7" fill="#FDF3C4" />
        <g fill="#FFFFFF" opacity="0.7">
          <circle cx="20" cy="18" r="0.9" />
          <circle cx="44" cy="10" r="0.7" />
          <circle cx="98" cy="14" r="0.8" />
          <circle cx="70" cy="24" r="0.6" />
        </g>
        <path d="M0 82 C50 74 110 90 160 80 V100 H0 Z" fill="#14402F" />
        <path d="M54 52 L82 30 L110 52 V84 H54 Z" fill="#E9EEF5" />
        <path d="M48 54 L82 26 L116 54" stroke="#B23B3B" strokeWidth="6" strokeLinejoin="round" fill="none" />
        <rect x="76" y="64" width="12" height="20" rx="1.5" fill="#7A4E2A" />
        <rect x="60" y="58" width="11" height="10" rx="1" fill="#FFD27A" />
        <rect x="93" y="58" width="11" height="10" rx="1" fill="#FFD27A" />
        <path d="M24 84 C18 60 34 58 30 84 Z" fill="#1F6B4F" />
        <path d="M136 84 C130 56 148 58 142 84 Z" fill="#1F6B4F" />
      </>
    ),
  }),
  wedding: () => ({
    sky: ["#FDE7EF", "#F6C1D3"],
    body: (
      <>
        <circle cx="66" cy="54" r="20" fill="none" stroke="#F59E0B" strokeWidth="6" />
        <circle cx="94" cy="54" r="20" fill="none" stroke="#FBD88E" strokeWidth="6" />
        <path d="M94 26 l4 -6 h6 l4 6 -7 6 z" fill="#CDEFEF" stroke="#0EA5A5" strokeWidth="1.5" />
        <g fill="#FFFFFF">
          <path d="M28 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" />
          <path d="M132 70 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 z" />
        </g>
      </>
    ),
  }),
  education: () => ({
    sky: ["#DCE8FB", "#8FB0E8"],
    body: (
      <>
        <path d="M30 76 h50 c6 0 10 3 10 3 V88 H30 Z" fill="#FFFFFF" />
        <path d="M130 76 h-50 c-6 0 -10 3 -10 3 V88 H130 Z" fill="#EEF2F8" />
        <path d="M30 88 H130" stroke="#3A5583" strokeWidth="2" />
        <path d="M80 26 L124 42 L80 58 L36 42 Z" fill="#0B1F3B" />
        <path d="M58 50 V62 C58 68 102 68 102 62 V50 L80 58 Z" fill="#132849" />
        <path d="M118 44 V62" stroke="#F59E0B" strokeWidth="2" />
        <circle cx="118" cy="64" r="3" fill="#F59E0B" />
      </>
    ),
  }),
  independence: () => ({
    sky: ["#D4F3F1", "#7FD3CF"],
    body: (
      <>
        <circle cx="128" cy="30" r="12" fill="#FFF1C2" />
        <g fill="#0EA5A5">
          <rect x="30" y="66" width="14" height="20" rx="2" opacity="0.55" />
          <rect x="52" y="56" width="14" height="30" rx="2" opacity="0.7" />
          <rect x="74" y="44" width="14" height="42" rx="2" opacity="0.85" />
          <rect x="96" y="30" width="14" height="56" rx="2" />
        </g>
        <path d="M28 60 L58 46 L80 36 L112 20" stroke="#0B1F3B" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M104 18 L114 19 L110 28" stroke="#0B1F3B" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M0 86 H160 V100 H0 Z" fill="#0B6F70" opacity="0.35" />
      </>
    ),
  }),
  retirement: () => ({
    sky: ["#FFB86B", "#C2410C"],
    body: (
      <>
        <circle cx="96" cy="62" r="22" fill="#FFE0A3" />
        <path d="M0 70 H160 V100 H0 Z" fill="#7C2D12" opacity="0.55" />
        <path d="M0 78 C40 72 120 84 160 76 V100 H0 Z" fill="#3B1D10" />
        <path d="M70 72 h52" stroke="#FFE0A3" strokeOpacity="0.6" strokeWidth="2" />
        <path d="M80 78 h32" stroke="#FFE0A3" strokeOpacity="0.4" strokeWidth="2" />
        <path d="M34 80 C36 60 38 46 44 32" stroke="#3B1D10" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M44 32 C34 26 24 30 18 36 M44 32 C50 22 62 22 68 26 M44 32 C40 22 32 18 24 20 M44 32 C54 30 62 36 64 42" stroke="#3B1D10" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
  }),
  emergency: () => ({
    sky: ["#CDEFEF", "#2FB6B8"],
    body: (
      <>
        <g transform="translate(80 52) scale(0.82) translate(-80 -53)">
          <path d="M80 18 L110 30 V52 C110 70 96 82 80 88 C64 82 50 70 50 52 V30 Z" fill="#0B1F3B" />
          <path d="M80 24 L104 34 V52 C104 66 93 76 80 81 C67 76 56 66 56 52 V34 Z" fill="#0EA5A5" />
          <path d="M68 52 L77 61 L94 43" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <circle cx="26" cy="74" r="10" fill="#FFFFFF" opacity="0.35" />
        <circle cx="136" cy="26" r="7" fill="#FFFFFF" opacity="0.35" />
      </>
    ),
  }),
  other: () => ({
    sky: ["#E3E9F4", "#9FB2D4"],
    body: (
      <>
        <circle cx="80" cy="52" r="30" fill="#FFFFFF" />
        <circle cx="80" cy="52" r="21" fill="#0B1F3B" />
        <circle cx="80" cy="52" r="12" fill="#FFFFFF" />
        <circle cx="80" cy="52" r="5" fill="#F59E0B" />
        <path d="M80 52 L118 20" stroke="#0EA5A5" strokeWidth="3" strokeLinecap="round" />
        <path d="M112 18 L122 16 L120 26" stroke="#0EA5A5" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  }),
};

export function GoalCover({ kind, className, title }: { kind: string; className?: string; title?: string }) {
  const k = (kind in SCENES ? kind : "other") as CoverKind;
  const id = `gc-${k}`;
  const scene = SCENES[k](id);
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className={cn("block", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.sky[0]} />
          <stop offset="1" stopColor={scene.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#${id}-sky)`} />
      {scene.body}
    </svg>
  );
}
