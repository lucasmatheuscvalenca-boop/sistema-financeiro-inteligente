import type { MascotId, MascotState } from "./catalog";

/**
 * Ilustrações dos mascotes (public/mascots/<id>/<estado>.webp): os personagens da referência
 * visual do projeto (docs/referencia-visual.webp), ampliados 4x com super-resolução e
 * recortados sem o contorno do fundo por scripts/assets/mascotes-alta-resolucao.py.
 * Para trocar por outras artes basta substituir os arquivos e atualizar o tamanho
 * intrínseco abaixo — e a versão no nome, para nenhum cache de imagem servir a arte antiga.
 * Estados sem arte própria usam a arte neutra + um selo.
 */
const ART_VERSION = 2;

const ART: Record<MascotId, Partial<Record<MascotState, readonly [number, number]>>> = {
  lince: {
    neutral: [368, 494],
    analysis: [287, 328],
    guidance: [259, 374],
    celebration: [297, 320],
    attention: [260, 369],
    alert: [294, 367],
  },
  capivara: { neutral: [432, 447] },
  coruja: { neutral: [415, 455] },
  polvo: { neutral: [471, 447] },
  raposa: { neutral: [347, 487] },
  guardiao: { neutral: [381, 478] },
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
  return { src: `/mascots/${id}/${own ? state : "neutral"}.v${ART_VERSION}.webp`, width: size[0], height: size[1], dedicated: !!own || state === "neutral" };
}
