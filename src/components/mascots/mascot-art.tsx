import type { ReactNode } from "react";
import { MASCOTS, MASCOT_STATE_LABEL, type MascotId, type MascotState } from "@/mascots/catalog";
import { cn } from "@/lib/cn";

/**
 * Ilustrações originais (SVG vetorial) dos seis mascotes, com seis estados visuais.
 * Representação inicial consistente e substituível: cada personagem é uma "cabeça"
 * própria; olhos, boca, fundo e acessório variam conforme o estado.
 */

type Point = [number, number];

interface FaceSpec {
  head: ReactNode;
  eyes: [Point, Point];
  mouth: Point | null;
  eyeColor: string;
  /** Olhos de LED (robô). */
  led?: boolean;
  eyeScale?: number;
}

const INK = "#0B1F3A";

const HEADS: Record<MascotId, FaceSpec> = {
  lince: {
    eyes: [
      [47, 64],
      [73, 64],
    ],
    mouth: [60, 87],
    eyeColor: "#7A4E12",
    head: (
      <g>
        <path d="M30 50 L26 18 L50 40 Z" fill="#C08A4B" />
        <path d="M90 50 L94 18 L70 40 Z" fill="#C08A4B" />
        <path d="M33 44 L30 26 L44 39 Z" fill="#F3E3CC" />
        <path d="M87 44 L90 26 L76 39 Z" fill="#F3E3CC" />
        <path d="M26 18 L23 6 L29 17 Z" fill={INK} />
        <path d="M94 18 L97 6 L91 17 Z" fill={INK} />
        <path d="M22 70 Q22 38 60 36 Q98 38 98 70 Q98 98 60 100 Q22 98 22 70 Z" fill="#C08A4B" />
        <path d="M22 72 L14 92 L30 88 L26 100 L40 92 Z" fill="#F3E3CC" />
        <path d="M98 72 L106 92 L90 88 L94 100 L80 92 Z" fill="#F3E3CC" />
        <ellipse cx="60" cy="82" rx="16" ry="12" fill="#F7EBD9" />
        <path d="M55 76 L65 76 L60 81 Z" fill={INK} />
        <path d="M60 81 L60 85" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M52 42 L54 50 M60 40 L60 49 M68 42 L66 50" stroke="#6B4520" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M36 80 L24 78 M36 84 L25 86 M84 80 L96 78 M84 84 L95 86" stroke="#6B4520" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      </g>
    ),
  },
  capivara: {
    eyes: [
      [44, 57],
      [76, 57],
    ],
    mouth: [60, 90],
    eyeColor: "#2B1A10",
    eyeScale: 0.85,
    head: (
      <g>
        <circle cx="36" cy="38" r="8" fill="#7E5236" />
        <circle cx="84" cy="38" r="8" fill="#7E5236" />
        <rect x="24" y="36" width="72" height="64" rx="28" fill="#9C6B48" />
        <rect x="32" y="64" width="56" height="34" rx="17" fill="#7E5236" />
        <ellipse cx="51" cy="74" rx="3" ry="2.2" fill="#3B2416" />
        <ellipse cx="69" cy="74" rx="3" ry="2.2" fill="#3B2416" />
        <circle cx="60" cy="27" r="9" fill="#F59E0B" />
        <path d="M60 18 Q66 12 70 16 Q65 20 60 18 Z" fill="#2E7D6B" />
        <ellipse cx="57" cy="24" rx="2.5" ry="1.6" fill="#FCD34D" opacity="0.8" />
      </g>
    ),
  },
  coruja: {
    eyes: [
      [46, 60],
      [74, 60],
    ],
    mouth: null,
    eyeColor: INK,
    eyeScale: 1.15,
    head: (
      <g>
        <path d="M30 40 L28 18 L46 32 Z" fill="#4A3B66" />
        <path d="M90 40 L92 18 L74 32 Z" fill="#4A3B66" />
        <ellipse cx="60" cy="68" rx="38" ry="38" fill="#5B4A7A" />
        <path d="M40 92 Q46 88 52 92 M52 96 Q58 92 64 96 M64 92 Q70 88 76 92" stroke="#E4DDF0" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.6" />
        <circle cx="46" cy="60" r="15" fill="#E4DDF0" />
        <circle cx="74" cy="60" r="15" fill="#E4DDF0" />
        <circle cx="46" cy="60" r="11.5" fill="none" stroke="#C9A227" strokeWidth="2.4" />
        <circle cx="74" cy="60" r="11.5" fill="none" stroke="#C9A227" strokeWidth="2.4" />
        <path d="M57.5 60 Q60 57 62.5 60" stroke="#C9A227" strokeWidth="2.4" fill="none" />
        <path d="M55 72 L65 72 L60 81 Z" fill="#C9A227" />
      </g>
    ),
  },
  polvo: {
    eyes: [
      [49, 54],
      [71, 54],
    ],
    mouth: [60, 67],
    eyeColor: INK,
    head: (
      <g>
        <path d="M34 72 Q26 92 18 96 Q28 102 38 90 Q42 84 44 76 Z" fill="#D9675A" />
        <path d="M46 76 Q44 96 36 106 Q48 108 54 92 Q56 86 56 78 Z" fill="#C9564A" />
        <path d="M74 76 Q76 96 84 106 Q72 108 66 92 Q64 86 64 78 Z" fill="#C9564A" />
        <path d="M86 72 Q94 92 102 96 Q92 102 82 90 Q78 84 76 76 Z" fill="#D9675A" />
        <path d="M56 78 Q58 98 60 104 Q62 98 64 78 Z" fill="#D9675A" />
        <ellipse cx="60" cy="52" rx="32" ry="30" fill="#D9675A" />
        <circle cx="40" cy="38" r="3.5" fill="#FBE0DA" opacity="0.7" />
        <circle cx="78" cy="34" r="2.5" fill="#FBE0DA" opacity="0.7" />
        <circle cx="84" cy="44" r="2" fill="#FBE0DA" opacity="0.7" />
        <circle cx="22" cy="96" r="1.6" fill="#FBE0DA" />
        <circle cx="98" cy="96" r="1.6" fill="#FBE0DA" />
        <rect x="86" y="62" width="16" height="20" rx="3" fill="#FFFFFF" stroke="#0E7C7B" strokeWidth="1.5" transform="rotate(12 94 72)" />
        <path d="M90 68 L98 70 M89.5 72 L97.5 74 M89 76 L95 77.5" stroke="#0E7C7B" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    ),
  },
  raposa: {
    eyes: [
      [46, 62],
      [74, 62],
    ],
    mouth: [60, 98],
    eyeColor: "#4A2408",
    head: (
      <g>
        <path d="M26 52 L22 14 L52 40 Z" fill="#E07A2E" />
        <path d="M94 52 L98 14 L68 40 Z" fill="#E07A2E" />
        <path d="M30 44 L28 24 L44 38 Z" fill={INK} opacity="0.85" />
        <path d="M90 44 L92 24 L76 38 Z" fill={INK} opacity="0.85" />
        <path d="M18 54 Q60 24 102 54 Q92 80 70 96 Q60 104 50 96 Q28 80 18 54 Z" fill="#E07A2E" />
        <path d="M18 54 Q34 64 48 66 Q52 86 60 96 Q50 96 40 86 Q26 72 18 54 Z" fill="#FCE6D2" />
        <path d="M102 54 Q86 64 72 66 Q68 86 60 96 Q70 96 80 86 Q94 72 102 54 Z" fill="#FCE6D2" />
        <ellipse cx="60" cy="92" rx="5" ry="3.8" fill={INK} />
        <path d="M60 40 L56 52 L64 52 Z" fill="#F29A55" opacity="0.6" />
      </g>
    ),
  },
  guardiao: {
    eyes: [
      [48, 58],
      [72, 58],
    ],
    mouth: [60, 68],
    eyeColor: "#5EEAD4",
    led: true,
    head: (
      <g>
        <path d="M60 30 L60 18" stroke="#9DB0CB" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="14" r="5" fill="#14B8A6" />
        <circle cx="60" cy="14" r="8" fill="#14B8A6" opacity="0.25" />
        <rect x="18" y="48" width="8" height="18" rx="3" fill="#1E5394" />
        <rect x="94" y="48" width="8" height="18" rx="3" fill="#1E5394" />
        <rect x="24" y="28" width="72" height="62" rx="20" fill="#2B6CB0" />
        <rect x="32" y="40" width="56" height="36" rx="13" fill={INK} />
        <rect x="35" y="43" width="22" height="3" rx="1.5" fill="#FFFFFF" opacity="0.12" />
        <path d="M60 86 L72 90 L72 100 Q72 108 60 112 Q48 108 48 100 L48 90 Z" fill="#C9A227" />
        <path d="M54 99 L58.5 103.5 L66 95" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
};

const BG: Record<MascotState, { fill: string; ring: string }> = {
  neutral: { fill: "", ring: "transparent" },
  analysis: { fill: "#EEF3FA", ring: "#ADC4E4" },
  guidance: { fill: "#E9F7F6", ring: "#94D9D4" },
  celebration: { fill: "#FBF6E6", ring: "#E0BC52" },
  attention: { fill: "#FFF7E6", ring: "#F2C14E" },
  alert: { fill: "#FFF1EA", ring: "#FB923C" },
};

function Eyes({ spec, state }: { spec: FaceSpec; state: MascotState }) {
  const s = spec.eyeScale ?? 1;
  const color = spec.eyeColor;
  const [[lx, ly], [rx, ry]] = spec.eyes;
  if (state === "celebration") {
    return (
      <g stroke={color} strokeWidth={2.8 * s} fill="none" strokeLinecap="round">
        <path d={`M${lx - 5 * s} ${ly + 1} Q${lx} ${ly - 5 * s} ${lx + 5 * s} ${ly + 1}`} />
        <path d={`M${rx - 5 * s} ${ry + 1} Q${rx} ${ry - 5 * s} ${rx + 5 * s} ${ry + 1}`} />
      </g>
    );
  }
  const r = (state === "attention" ? 5.6 : 4.6) * s;
  const left = state === "analysis" ? <ellipse cx={lx} cy={ly} rx={r} ry={r * 0.45} fill={color} /> : <circle cx={lx} cy={ly} r={r} fill={color} />;
  const brows =
    state === "alert" ? (
      <g stroke={spec.led ? color : INK} strokeWidth={2.2} strokeLinecap="round">
        <path d={`M${lx - 6} ${ly - 9} L${lx + 5} ${ly - 6}`} />
        <path d={`M${rx + 6} ${ry - 9} L${rx - 5} ${ry - 6}`} />
      </g>
    ) : state === "attention" ? (
      <g stroke={spec.led ? color : INK} strokeWidth={2} strokeLinecap="round" fill="none">
        <path d={`M${lx - 6} ${ly - 10} Q${lx} ${ly - 13} ${lx + 6} ${ly - 10}`} />
        <path d={`M${rx - 6} ${ry - 10} Q${rx} ${ry - 13} ${rx + 6} ${ry - 10}`} />
      </g>
    ) : state === "analysis" ? (
      <path d={`M${rx - 6} ${ry - 10} Q${rx} ${ry - 13} ${rx + 6} ${ry - 9}`} stroke={spec.led ? color : INK} strokeWidth={2} fill="none" strokeLinecap="round" />
    ) : null;
  return (
    <g>
      {spec.led ? <circle cx={lx} cy={ly} r={r + 3} fill={color} opacity={0.18} /> : null}
      {spec.led ? <circle cx={rx} cy={ry} r={r + 3} fill={color} opacity={0.18} /> : null}
      {left}
      <circle cx={rx} cy={ry} r={r} fill={color} />
      {!spec.led ? (
        <>
          <circle cx={lx + r * 0.35} cy={ly - r * 0.35} r={r * 0.3} fill="#FFFFFF" opacity={state === "analysis" ? 0 : 0.9} />
          <circle cx={rx + r * 0.35} cy={ry - r * 0.35} r={r * 0.3} fill="#FFFFFF" opacity={0.9} />
        </>
      ) : null}
      {brows}
    </g>
  );
}

function Mouth({ spec, state }: { spec: FaceSpec; state: MascotState }) {
  if (!spec.mouth) return null;
  const [x, y] = spec.mouth;
  const stroke = spec.led ? spec.eyeColor : INK;
  switch (state) {
    case "neutral":
      return <path d={`M${x - 5} ${y} Q${x} ${y + 4} ${x + 5} ${y}`} stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    case "analysis":
      return <path d={`M${x - 4} ${y + 1} L${x + 5} ${y}`} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />;
    case "guidance":
      return <path d={`M${x - 7} ${y - 1} Q${x} ${y + 7} ${x + 7} ${y - 1}`} stroke={stroke} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
    case "celebration":
      return <path d={`M${x - 8} ${y - 2} Q${x} ${y + 11} ${x + 8} ${y - 2} Z`} fill={spec.led ? spec.eyeColor : "#7A1F1F"} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />;
    case "attention":
      return <ellipse cx={x} cy={y + 1} rx="3" ry="3.6" fill={spec.led ? spec.eyeColor : "#5A1A1A"} />;
    case "alert":
      return <path d={`M${x - 7} ${y + 2} Q${x - 3.5} ${y - 2} ${x} ${y + 2} Q${x + 3.5} ${y + 6} ${x + 7} ${y + 2}`} stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  }
}

function Accessory({ state }: { state: MascotState }) {
  switch (state) {
    case "analysis":
      return (
        <g>
          <circle cx="96" cy="28" r="10" fill="#FFFFFF" stroke="#254679" strokeWidth="3" />
          <path d="M90 31 L94 26 L97 29 L102 23" stroke="#0E7C7B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M103 35 L111 43" stroke="#254679" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case "guidance":
      return (
        <g>
          <circle cx="98" cy="24" r="12" fill="#E9F7F6" />
          <path d="M98 14 Q106 14 106 22 Q106 27 101.5 30 L101.5 33 L94.5 33 L94.5 30 Q90 27 90 22 Q90 14 98 14 Z" fill="#E0BC52" />
          <rect x="94.5" y="34" width="7" height="3" rx="1" fill="#82641A" />
          <path d="M98 6 L98 9 M110 12 L108 14 M86 12 L88 14" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case "celebration":
      return (
        <g>
          <path d="M98 10 L101.5 18.5 L110.5 19 L103.5 24.5 L106 33 L98 28 L90 33 L92.5 24.5 L85.5 19 L94.5 18.5 Z" fill="#C9A227" />
          <circle cx="16" cy="22" r="3" fill="#14B8A6" />
          <rect x="22" y="8" width="5" height="5" rx="1" fill="#E07A2E" transform="rotate(25 24 10)" />
          <circle cx="108" cy="46" r="2.5" fill="#D9675A" />
          <rect x="10" y="40" width="4" height="4" rx="1" fill="#C9A227" transform="rotate(-20 12 42)" />
        </g>
      );
    case "attention":
      return (
        <g>
          <circle cx="98" cy="24" r="12" fill="#F2C14E" />
          <path d="M98 16 L98 26" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="98" cy="31.5" r="2" fill={INK} />
        </g>
      );
    case "alert":
      return (
        <g>
          <path d="M98 10 L112 35 L84 35 Z" fill="#EA580C" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
          <path d="M98 18 L98 27" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="98" cy="31" r="1.8" fill="#FFFFFF" />
        </g>
      );
    default:
      return null;
  }
}

export function MascotArt({ id, state = "neutral", size = 96, className, decorative = false }: { id: MascotId; state?: MascotState; size?: number; className?: string; decorative?: boolean }) {
  const m = MASCOTS[id];
  const spec = HEADS[id];
  const bg = BG[state];
  const label = `${m.name}, ${m.title} — ${MASCOT_STATE_LABEL[state]}`;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn("shrink-0", state === "celebration" && "animate-pop", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      data-mascot={id}
      data-state={state}
    >
      {decorative ? null : <title>{label}</title>}
      <circle cx="60" cy="62" r="56" fill={bg.fill || m.palette.secondary} />
      <circle cx="60" cy="62" r="56" fill="none" stroke={bg.ring} strokeWidth="3" />
      <ellipse cx="60" cy="112" rx="30" ry="4" fill={INK} opacity="0.08" />
      {spec.head}
      <Eyes spec={spec} state={state} />
      <Mouth spec={spec} state={state} />
      <Accessory state={state} />
    </svg>
  );
}
