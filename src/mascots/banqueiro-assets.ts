/**
 * Ativos oficiais do Banqueiro (kit aprovado, design/referencias/LEIA-ME-kit.txt).
 *
 * Os PNGs em public/assets/banqueiro são os arquivos do kit sem nenhuma alteração; o
 * SHA-256 de cada um está em design/referencias/SHA256-ativos-banqueiro.txt. Alguns recortes
 * do kit trouxeram restos da prancha (pílulas de rótulo, a mão ou a cabeça de uma pose vizinha).
 * Em vez de editar a arte, cada ativo declara a área visível (`recorte`, em pixels do arquivo)
 * e, quando um resto encosta no personagem, um contorno (`mascara`) que o esconde.
 */
export type BanqueiroExpressao = "neutro" | "analise" | "orientacao" | "comemoracao" | "atencao" | "alerta";
export type BanqueiroPose = "base" | "corpo-inteiro" | "apresentacao" | "assistente-chat" | "onboarding" | "explicacao" | "pensando" | "comemorando";
export type BanqueiroAvatar = "claro" | "escuro" | "dourado";

export interface BanqueiroAtivo {
  src: string;
  /** Tamanho natural do arquivo, em pixels. */
  largura: number;
  altura: number;
  /** Área visível [x, y, largura, altura], em pixels do arquivo. */
  recorte: readonly [number, number, number, number];
  /** Contorno da área visível em pixels do arquivo (clip-path), quando um resto encosta no personagem. */
  mascara?: ReadonlyArray<readonly [number, number]>;
  rotulo: string;
}

const BASE = "/assets/banqueiro";

export const EXPRESSOES: Record<BanqueiroExpressao, BanqueiroAtivo> = {
  neutro: { src: `${BASE}/expressoes/02-neutro.png`, largura: 133, altura: 183, recorte: [0, 0, 133, 183], rotulo: "neutro" },
  analise: { src: `${BASE}/expressoes/03-analise.png`, largura: 137, altura: 183, recorte: [0, 0, 137, 183], rotulo: "análise" },
  orientacao: { src: `${BASE}/expressoes/04-orientacao.png`, largura: 138, altura: 180, recorte: [0, 0, 138, 180], rotulo: "orientação" },
  // Pílula de rótulo da prancha nas linhas 195–197.
  comemoracao: { src: `${BASE}/expressoes/05-comemoracao.png`, largura: 200, altura: 198, recorte: [0, 0, 200, 193], rotulo: "comemoração" },
  atencao: { src: `${BASE}/expressoes/06-atencao.png`, largura: 144, altura: 181, recorte: [0, 0, 144, 181], rotulo: "atenção" },
  alerta: { src: `${BASE}/expressoes/07-alerta.png`, largura: 146, altura: 183, recorte: [0, 0, 146, 183], rotulo: "alerta" },
};

// Os avatares trazem embaixo a pílula do rótulo e, nas laterais, um pedaço do avatar vizinho.
export const AVATARES: Record<BanqueiroAvatar, BanqueiroAtivo> = {
  claro: { src: `${BASE}/avatares/08-avatar-claro.png`, largura: 130, altura: 155, recorte: [3, 4, 122, 132], rotulo: "avatar claro" },
  escuro: { src: `${BASE}/avatares/09-avatar-escuro.png`, largura: 130, altura: 155, recorte: [0, 4, 116, 132], rotulo: "avatar escuro" },
  dourado: { src: `${BASE}/avatares/10-avatar-dourado.png`, largura: 122, altura: 154, recorte: [0, 3, 116, 132], rotulo: "avatar com borda dourada" },
};

export const POSES: Record<BanqueiroPose, BanqueiroAtivo> = {
  // A cabeça de outra pose aparece sob os braços cruzados (linhas 296–309).
  base: { src: `${BASE}/poses/01-banqueiro-base.png`, largura: 230, altura: 310, recorte: [0, 0, 230, 295], rotulo: "braços cruzados" },
  // A faixa dos braços cruzados da pose de cima vai até a linha 29 e encosta no cabelo, que começa na 19.
  "corpo-inteiro": {
    src: `${BASE}/poses/11-corpo-inteiro.png`,
    largura: 187,
    altura: 315,
    recorte: [0, 18, 187, 297],
    mascara: [
      [0, 30], [57, 30], [58, 29], [59, 28], [60, 27], [61, 26], [62, 25], [63, 24], [64, 23], [66, 22], [68, 21], [70, 20], [73, 19], [77, 18.5],
      [81, 19.5], [82, 21], [83, 22], [84, 23], [85, 24], [86, 26], [91, 27], [92, 28], [93, 29], [94, 30], [187, 30], [187, 315], [0, 315],
    ],
    rotulo: "corpo inteiro",
  },
  apresentacao: { src: `${BASE}/poses/12-apresentacao.png`, largura: 153, altura: 175, recorte: [0, 0, 153, 169], rotulo: "apresentação" },
  "assistente-chat": { src: `${BASE}/poses/13-assistente-chat.png`, largura: 220, altura: 180, recorte: [0, 0, 220, 170], rotulo: "assistente no computador" },
  onboarding: { src: `${BASE}/poses/14-onboarding.png`, largura: 190, altura: 180, recorte: [0, 0, 190, 168], rotulo: "boas-vindas com tablet" },
  explicacao: { src: `${BASE}/poses/15-explicacao.png`, largura: 180, altura: 180, recorte: [18, 0, 162, 167], rotulo: "explicação" },
  // A mão da pose vizinha aparece à esquerda (colunas 0–29).
  pensando: { src: `${BASE}/poses/16-pensando.png`, largura: 153, altura: 180, recorte: [38, 0, 115, 165], rotulo: "pensando" },
  comemorando: { src: `${BASE}/poses/17-comemorando-pose.png`, largura: 195, altura: 195, recorte: [24, 4, 171, 178], rotulo: "comemorando" },
};
