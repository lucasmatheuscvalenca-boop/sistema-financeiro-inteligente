import type { MascotId, MascotState } from "./catalog";

/**
 * Ilustrações dos mascotes (public/mascots/<id>/<estado>.webp), extraídas da referência
 * visual do projeto (docs/referencia-visual.webp) por scripts/assets/cutout-mascots.py.
 * Para trocar por artes em alta resolução basta substituir os arquivos e atualizar o
 * tamanho intrínseco abaixo. Estados sem arte própria usam a arte neutra + um selo.
 */
const ART: Record<MascotId, Partial<Record<MascotState, readonly [number, number]>>> = {
  lince: {
    neutral: [293, 379],
    analysis: [233, 257],
    guidance: [212, 289],
    celebration: [242, 253],
    attention: [212, 286],
    alert: [239, 283],
  },
  capivara: { neutral: [337, 343] },
  coruja: { neutral: [328, 349] },
  polvo: { neutral: [364, 343] },
  raposa: { neutral: [278, 373] },
  guardiao: { neutral: [309, 372] },
};

export interface MascotImage {
  src: string;
  width: number;
  height: number;
  /** true quando o estado tem ilustração própria (sem necessidade de selo). */
  dedicated: boolean;
}

export function mascotImage(id: MascotId, state: MascotState): MascotImage {
  const own = ART[id][state];
  const size = own ?? ART[id].neutral!;
  return { src: `/mascots/${id}/${own ? state : "neutral"}.webp`, width: size[0], height: size[1], dedicated: !!own || state === "neutral" };
}
