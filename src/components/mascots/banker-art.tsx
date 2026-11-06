import type { MascotState } from "@/mascots/catalog";

/**
 * O Banqueiro em arte vetorial: um consultor adulto, de cabelo ondulado e barba curta, óculos
 * redondos dourados, camisa branca, colete verde-profundo com um emblema dourado e gravata verde.
 * Desenhado em SVG para ficar nítido em qualquer tamanho e nos dois temas. Só o rosto, as mãos
 * e um selo pequeno mudam entre as seis expressões; o corpo é sempre o mesmo.
 */
const SKIN = "#E7B98F";
const SKIN_SHADE = "#CF9A6B";
const HAIR = "#3B2416";
const HAIR_LIGHT = "#5A3A26";
const VEST = "#0F4A3A";
const VEST_DARK = "#0A3328";
const SHIRT = "#FBFAF5";
const SHIRT_SHADE = "#E6E1D5";
const TIE = "#0F5A45";
const GOLD = "#D4AF57";
const GOLD_DARK = "#B8923F";
const INK = "#1F1A17";
const MOUTH = "#5A2A2A";

type Eyes = "open" | "wide" | "narrow" | "happy";

const FACE: Record<MascotState, { brows: [string, string]; eyes: Eyes; mouth: string; filled?: boolean }> = {
  neutral: { brows: ["M70 76 Q83 70 96 75", "M104 75 Q117 70 130 76"], eyes: "open", mouth: "M88 115 Q100 122 112 115" },
  analysis: { brows: ["M70 72 Q83 63 96 72", "M104 77 Q117 73 130 78"], eyes: "narrow", mouth: "M90 117 H110" },
  guidance: { brows: ["M70 73 Q83 66 96 73", "M104 73 Q117 66 130 73"], eyes: "open", mouth: "M86 113 Q100 130 114 113 Z", filled: true },
  celebration: { brows: ["M70 71 Q83 64 96 71", "M104 71 Q117 64 130 71"], eyes: "happy", mouth: "M84 113 Q100 134 116 113 Z", filled: true },
  attention: { brows: ["M70 68 Q83 60 96 69", "M104 69 Q117 60 130 68"], eyes: "wide", mouth: "" },
  alert: { brows: ["M70 70 Q84 74 96 81", "M104 81 Q116 74 130 70"], eyes: "open", mouth: "M88 121 Q100 113 112 121" },
};

const BADGE: Record<Exclude<MascotState, "neutral">, { fill: string; ink: string }> = {
  analysis: { fill: "#0B3A30", ink: "#F7F5EF" },
  guidance: { fill: "#008B56", ink: "#F7F5EF" },
  celebration: { fill: GOLD, ink: "#0A3328" },
  attention: { fill: "#F2B100", ink: "#0A3328" },
  alert: { fill: "#D1342F", ink: "#F7F5EF" },
};

function Eye({ cx, kind }: { cx: number; kind: Eyes }) {
  if (kind === "happy") return <path d={`M${cx - 7} 96 Q${cx} 86 ${cx + 7} 96`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />;
  const ry = kind === "wide" ? 8.5 : kind === "narrow" ? 4.6 : 7;
  const rx = kind === "wide" ? 7 : 6;
  return (
    <>
      <ellipse cx={cx} cy={94} rx={rx} ry={ry} fill="#FFFDF8" />
      <circle cx={cx + 1} cy={95} r={kind === "narrow" ? 2.8 : 3.3} fill={INK} />
      <circle cx={cx + 2.2} cy={93.6} r={1} fill="#fff" />
    </>
  );
}

/** Mão aberta, apresentando: aparece nas expressões de orientação e comemoração. */
function Hand({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <rect x={-12} y={14} width={24} height={10} rx={3} fill={SHIRT} />
      <ellipse cx={0} cy={6} rx={11} ry={12} fill={SKIN} />
      <rect x={-10} y={-14} width={5.5} height={20} rx={2.75} fill={SKIN} />
      <rect x={-3.5} y={-18} width={5.5} height={24} rx={2.75} fill={SKIN} />
      <rect x={3} y={-16} width={5.5} height={22} rx={2.75} fill={SKIN} />
      <rect x={9} y={-10} width={5} height={18} rx={2.5} fill={SKIN} />
      <ellipse cx={-12} cy={6} rx={4} ry={6.5} transform="rotate(-30 -12 6)" fill={SKIN_SHADE} />
    </g>
  );
}

function BadgeIcon({ state, ink }: { state: Exclude<MascotState, "neutral">; ink: string }) {
  const stroke = { fill: "none", stroke: ink, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (state) {
    case "analysis":
      return (
        <>
          <circle cx={-2} cy={-2} r={6.5} {...stroke} />
          <path d="M3 3 L9 9" {...stroke} />
        </>
      );
    case "guidance":
      return (
        <>
          <path d="M-6 -2 a6 6 0 1 1 12 0 c0 3 -2 4 -2.5 6 h-7 c-.5 -2 -2.5 -3 -2.5 -6 Z" {...stroke} />
          <path d="M-3 8 H3" {...stroke} />
        </>
      );
    case "celebration":
      return (
        <>
          <path d="M-7 -9 H7 V-3 A7 7 0 0 1 -7 -3 Z" fill={ink} />
          <path d="M-9 -7 H-11 A4 4 0 0 0 -7 -1 M9 -7 H11 A4 4 0 0 1 7 -1" {...stroke} strokeWidth={2} />
          <path d="M-2 4 H2 V7 H-4 H4" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
    case "attention":
      return (
        <>
          <path d="M0 -8 V2" {...stroke} strokeWidth={3.2} />
          <circle cx={0} cy={7.5} r={1.9} fill={ink} />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M0 -9 L9.5 7.5 H-9.5 Z" {...stroke} strokeWidth={2.4} />
          <path d="M0 -2 V2.5" {...stroke} strokeWidth={2.4} />
          <circle cx={0} cy={5.3} r={1.3} fill={ink} />
        </>
      );
  }
}

export function BankerArt({ state = "neutral", size = 96, className, label, decorative = false }: { state?: MascotState; size?: number; className?: string; label?: string; decorative?: boolean }) {
  const f = FACE[state];
  const badge = state !== "neutral" ? BADGE[state] : null;
  const hands = state === "guidance" || state === "celebration";
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMax meet"
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      {state === "celebration" ? (
        <g aria-hidden>
          <circle cx={34} cy={46} r={3.2} fill={GOLD} />
          <rect x={160} y={30} width={7} height={7} rx={1.5} transform="rotate(20 163 33)" fill="#22C55E" />
          <circle cx={172} cy={70} r={2.6} fill={GOLD} />
          <rect x={26} y={88} width={6} height={6} rx={1.2} transform="rotate(-25 29 91)" fill="#22C55E" />
          <path d="M150 20 l3 6 l-6 0 z" fill={GOLD} />
          <circle cx={48} cy={24} r={2.2} fill="#22C55E" />
        </g>
      ) : null}
      {/* Pescoço, camisa (ombros e mangas) e colete */}
      <path d="M86 116 H114 V142 L100 154 L86 142 Z" fill={SKIN_SHADE} />
      <path d="M10 200 C12 164 42 146 80 136 L100 156 L120 136 C158 146 188 164 190 200 Z" fill={SHIRT} />
      <path d="M10 200 C11 180 18 166 30 156 L40 200 Z" fill={SHIRT_SHADE} />
      <path d="M190 200 C189 180 182 166 170 156 L160 200 Z" fill={SHIRT_SHADE} />
      <path d="M44 200 C46 166 64 150 82 141 L100 160 L118 141 C136 150 154 166 156 200 Z" fill={VEST} />
      <path d="M82 141 L100 160 L96 200 L62 200 L58 156 Z" fill={VEST_DARK} opacity={0.35} />
      {/* Colarinho e gravata */}
      <path d="M82 136 L100 152 L118 136 L112 132 L100 144 L88 132 Z" fill={SHIRT} />
      <path d="M94 150 H106 L104 157 H96 Z" fill={TIE} />
      <path d="M96 157 H104 L107 182 L100 191 L93 182 Z" fill={TIE} />
      <path d="M98 160 L102 160 L104 178 L100 184 L96 178 Z" fill="#0A3328" opacity={0.35} />
      {/* Emblema dourado no colete */}
      <g transform="translate(128 172)">
        <circle r={6.2} fill={GOLD} />
        <circle r={4.6} fill="none" stroke={GOLD_DARK} strokeWidth={1} />
        <path d="M1.8 -2.2 C0.4 -3.6 -2.4 -2.8 -2.2 -1 C-2 0.6 2.2 0.4 2.2 2 C2.2 3.6 -1 4 -2.2 2.6" fill="none" stroke="#0A3328" strokeWidth={1.3} strokeLinecap="round" />
        <path d="M0 -4 V4.6" stroke="#0A3328" strokeWidth={0.9} strokeLinecap="round" />
      </g>
      {hands ? <Hand x={40} y={146} flip /> : null}
      {state === "celebration" ? <Hand x={158} y={112} /> : null}
      {/* Cabeça */}
      <ellipse cx={58} cy={96} rx={6} ry={9} fill={SKIN_SHADE} />
      <ellipse cx={142} cy={96} rx={6} ry={9} fill={SKIN_SHADE} />
      <ellipse cx={100} cy={90} rx={42} ry={48} fill={SKIN} />
      {/* Barba curta: cobre o queixo e o maxilar, com a boca livre. */}
      <path fillRule="evenodd" d="M60 102 C62 128 78 140 100 140 C122 140 138 128 140 102 C136 116 124 122 100 122 C76 122 64 116 60 102 Z M84 112 C84 120 116 120 116 112 C116 106 84 106 84 112 Z" fill={HAIR} />
      <path d="M86 108 Q100 103 114 108 Q100 112 86 108 Z" fill={HAIR} />
      {/* Cabelo ondulado com risca lateral e mechas mais claras. */}
      <path d="M56 98 C48 66 52 30 78 24 C88 18 112 18 122 24 C148 30 152 66 144 98 C142 74 130 60 114 56 C106 63 92 63 82 55 C68 59 58 74 56 98 Z" fill={HAIR} />
      <path d="M64 56 C70 42 82 34 96 32 M112 32 C124 34 134 44 138 56" fill="none" stroke={HAIR_LIGHT} strokeWidth="3" strokeLinecap="round" />
      <path d="M58 90 C56 78 60 68 68 62" fill="none" stroke={HAIR_LIGHT} strokeWidth="2.4" strokeLinecap="round" />
      {/* Rosto */}
      <path d={f.brows[0]} fill="none" stroke={HAIR} strokeWidth="3.2" strokeLinecap="round" />
      <path d={f.brows[1]} fill="none" stroke={HAIR} strokeWidth="3.2" strokeLinecap="round" />
      <Eye cx={84} kind={f.eyes} />
      <Eye cx={116} kind={f.eyes} />
      <g fill="none" stroke={GOLD} strokeWidth="2.2">
        <circle cx={84} cy={94} r={14} />
        <circle cx={116} cy={94} r={14} />
        <path d="M98 92 Q100 89 102 92" />
        <path d="M70 92 L62 89" />
        <path d="M130 92 L138 89" />
      </g>
      <path d="M100 99 Q95 108 101 109" fill="none" stroke={SKIN_SHADE} strokeWidth="2.2" strokeLinecap="round" />
      {f.mouth ? (
        f.filled ? (
          <>
            <path d={f.mouth} fill={MOUTH} />
            <path d={f.mouth.replace(/Z$/, "")} fill="none" stroke={INK} strokeWidth="1.5" />
            <path d="M90 115 H110" stroke="#FFFDF8" strokeWidth="4" strokeLinecap="round" />
          </>
        ) : (
          <path d={f.mouth} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        )
      ) : (
        <ellipse cx={100} cy={119} rx={5} ry={6} fill={MOUTH} />
      )}
      {badge ? (
        <g transform="translate(162 158)" aria-hidden>
          <circle r={21} fill={badge.fill} stroke="var(--surface, #fff)" strokeWidth="3" />
          <BadgeIcon state={state as Exclude<MascotState, "neutral">} ink={badge.ink} />
        </g>
      ) : null}
    </svg>
  );
}
