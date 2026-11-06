import type { MascotState } from "@/mascots/catalog";

/**
 * O Banqueiro em arte vetorial: um consultor adulto, de terno verde-profundo e gravata dourada,
 * desenhado em SVG para ficar nítido em qualquer tamanho e nos dois temas. Só o rosto (sobrancelhas,
 * olhos e boca) e um selo pequeno mudam entre as seis expressões; o corpo é sempre o mesmo.
 */
const SKIN = "#C9905E";
const SKIN_SHADE = "#B07A4C";
const HAIR = "#2A1C15";
const HAIR_GRAY = "#8C8178";
const SUIT = "#0F4A3A";
const SUIT_DARK = "#0A3328";
const SHIRT = "#F7F5EF";
const GOLD = "#D4AF57";
const GOLD_DARK = "#B8923F";
const INK = "#1F1A17";

type Eyes = "open" | "wide" | "narrow" | "happy";

const FACE: Record<MascotState, { brows: [string, string]; eyes: Eyes; mouth: string; filled?: boolean }> = {
  neutral: { brows: ["M70 76 Q83 70 96 75", "M104 75 Q117 70 130 76"], eyes: "open", mouth: "M87 116 Q100 124 113 116" },
  analysis: { brows: ["M70 72 Q83 63 96 72", "M104 77 Q117 73 130 78"], eyes: "narrow", mouth: "M89 118 H111" },
  guidance: { brows: ["M70 73 Q83 66 96 73", "M104 73 Q117 66 130 73"], eyes: "open", mouth: "M85 113 Q100 132 115 113 Z", filled: true },
  celebration: { brows: ["M70 71 Q83 64 96 71", "M104 71 Q117 64 130 71"], eyes: "happy", mouth: "M83 113 Q100 136 117 113 Z", filled: true },
  attention: { brows: ["M70 68 Q83 60 96 69", "M104 69 Q117 60 130 68"], eyes: "wide", mouth: "" },
  alert: { brows: ["M70 70 Q84 74 96 81", "M104 81 Q116 74 130 70"], eyes: "open", mouth: "M87 122 Q100 113 113 122" },
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
      {/* Pescoço e tronco */}
      <path d="M86 116 H114 V142 L100 154 L86 142 Z" fill={SKIN_SHADE} />
      <path d="M12 200 C14 164 44 148 80 138 L100 156 L120 138 C156 148 186 164 188 200 Z" fill={SUIT} />
      <path d="M80 138 L100 198 L120 138 L111 133 L100 146 L89 133 Z" fill={SHIRT} />
      <path d="M80 138 L100 198 L93 200 L60 152 Z" fill={SUIT_DARK} />
      <path d="M120 138 L100 198 L107 200 L140 152 Z" fill={SUIT_DARK} />
      <path d="M94 146 H106 L104 153 H96 Z" fill={GOLD_DARK} />
      <path d="M96 153 H104 L108 180 L100 190 L92 180 Z" fill={GOLD} />
      <path d="M150 166 L164 161 L162 172 Z" fill={GOLD} />
      {/* Cabeça */}
      <ellipse cx={58} cy={96} rx={6} ry={9} fill={SKIN_SHADE} />
      <ellipse cx={142} cy={96} rx={6} ry={9} fill={SKIN_SHADE} />
      <ellipse cx={100} cy={90} rx={42} ry={48} fill={SKIN} />
      {/* Cabelo curto com risca lateral e têmporas grisalhas: um consultor experiente. */}
      <path d="M56 96 C50 16 150 16 144 96 C141 72 128 60 114 57 C106 64 92 64 82 56 C68 60 59 74 56 96 Z" fill={HAIR} />
      <path d="M60 92 C61 80 65 72 71 66" fill="none" stroke={HAIR_GRAY} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M140 92 C139 80 135 72 129 66" fill="none" stroke={HAIR_GRAY} strokeWidth="3.2" strokeLinecap="round" />
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
            <path d={f.mouth} fill="#5A2A2A" />
            <path d={f.mouth.replace(/Z$/, "")} fill="none" stroke={INK} strokeWidth="1.5" />
            <path d="M89 115 H111" stroke="#FFFDF8" strokeWidth="4" strokeLinecap="round" />
          </>
        ) : (
          <path d={f.mouth} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        )
      ) : (
        <ellipse cx={100} cy={120} rx={5} ry={6.5} fill="#5A2A2A" />
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
