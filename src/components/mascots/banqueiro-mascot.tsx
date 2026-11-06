import Image from "next/image";
import type { CSSProperties } from "react";
import { AVATARES, EXPRESSOES, POSES, type BanqueiroAtivo, type BanqueiroAvatar, type BanqueiroExpressao, type BanqueiroPose } from "@/mascots/banqueiro-assets";
import { cn } from "@/lib/cn";

type Fonte = { expressao: BanqueiroExpressao; pose?: never; avatar?: never } | { pose: BanqueiroPose; expressao?: never; avatar?: never } | { avatar: BanqueiroAvatar; expressao?: never; pose?: never };

/**
 * O Banqueiro a partir dos arquivos aprovados do kit, sem filtros nem redesenho.
 *
 * Escolha uma `expressao`, uma `pose` ou um `avatar`. O tamanho é a caixa reservada na tela
 * (`largura` × `altura`, em px); a arte cabe nela com `object-fit: contain`, preservando a
 * proporção, alinhada embaixo (ou ao centro, nos avatares). Só a área visível declarada no
 * manifesto aparece, o que esconde os restos de prancha que vieram em alguns recortes.
 */
export function BanqueiroMascot({
  largura,
  altura,
  className,
  decorativo = false,
  prioridade = false,
  estado,
  ...fonte
}: Fonte & {
  largura: number;
  altura: number;
  className?: string;
  decorativo?: boolean;
  prioridade?: boolean;
  /** Valor exposto em data-state (compatibilidade com testes e estilos que já usam o estado). */
  estado?: string;
}) {
  const ativo: BanqueiroAtivo = fonte.expressao ? EXPRESSOES[fonte.expressao] : fonte.pose ? POSES[fonte.pose] : AVATARES[fonte.avatar!];
  const [cx, cy, cw, ch] = ativo.recorte;
  // object-fit: contain da área visível dentro da caixa.
  const escala = Math.min(largura / cw, altura / ch);
  const vw = cw * escala;
  const vh = ch * escala;
  const imgStyle: CSSProperties = {
    position: "absolute",
    left: -cx * escala,
    top: -cy * escala,
    width: ativo.largura * escala,
    height: ativo.altura * escala,
    maxWidth: "none",
    objectFit: "contain",
    clipPath: ativo.mascara ? `polygon(${ativo.mascara.map(([x, y]) => `${((x / ativo.largura) * 100).toFixed(3)}% ${((y / ativo.altura) * 100).toFixed(3)}%`).join(", ")})` : undefined,
  };
  const alt = decorativo ? "" : `O Banqueiro, ${ativo.rotulo}`;
  return (
    <span
      className={cn("relative inline-flex shrink-0 justify-center", fonte.avatar ? "items-center" : "items-end", className)}
      style={{ width: largura, height: altura }}
      data-mascot="banqueiro"
      data-state={estado ?? fonte.expressao ?? fonte.pose ?? `avatar-${fonte.avatar}`}
    >
      <span className="relative block overflow-hidden" style={{ width: vw, height: vh }}>
        <Image src={ativo.src} alt={alt} aria-hidden={decorativo || undefined} width={ativo.largura} height={ativo.altura} unoptimized priority={prioridade} draggable={false} style={imgStyle} className="select-none" />
      </span>
    </span>
  );
}
