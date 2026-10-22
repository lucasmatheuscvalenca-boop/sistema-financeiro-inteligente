import Image from "next/image";
import { CircleAlert, Lightbulb, Search, TriangleAlert, Trophy } from "lucide-react";
import { MASCOTS, MASCOT_STATE_LABEL, type MascotId, type MascotState } from "@/mascots/catalog";
import { mascotImage } from "@/mascots/assets";
import { cn } from "@/lib/cn";

const BADGE: Record<Exclude<MascotState, "neutral">, { icon: typeof Search; className: string }> = {
  analysis: { icon: Search, className: "bg-navy-900 text-white dark:bg-petrol-600" },
  guidance: { icon: Lightbulb, className: "bg-petrol-500 text-white" },
  celebration: { icon: Trophy, className: "bg-gold-500 text-navy-900" },
  attention: { icon: CircleAlert, className: "bg-amber-400 text-navy-900" },
  alert: { icon: TriangleAlert, className: "bg-red-600 text-white" },
};

/**
 * Mascote com seis estados visuais. O estado muda a ilustração (quando existe arte
 * própria) ou acrescenta um selo; a personalidade nunca muda os cálculos.
 */
export function MascotArt({
  id,
  state = "neutral",
  size = 96,
  className,
  decorative = false,
  priority = false,
  animate = false,
}: {
  id: MascotId;
  state?: MascotState;
  size?: number;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
  /** Movimento sutil (flutuar no neutro/orientação, “pulo” na celebração). */
  animate?: boolean;
}) {
  const m = MASCOTS[id];
  const img = mascotImage(id, state);
  const label = `${m.name}, ${m.title} — ${MASCOT_STATE_LABEL[state]}`;
  const badge = !img.dedicated && state !== "neutral" ? BADGE[state] : null;
  const Icon = badge?.icon;
  const badgeSize = Math.max(16, Math.round(size * 0.34));
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-end justify-center", animate && (state === "celebration" ? "animate-pop" : "animate-float"), className)}
      style={{ width: size, height: size }}
      data-mascot={id}
      data-state={state}
    >
      <Image
        src={img.src}
        width={img.width}
        height={img.height}
        alt={decorative ? "" : label}
        aria-hidden={decorative || undefined}
        priority={priority}
        sizes={`${size}px`}
        draggable={false}
        className="mascot-img h-full w-full object-contain object-bottom"
      />
      {badge && Icon ? (
        <span
          className={cn("absolute bottom-0 right-0 grid place-items-center rounded-full ring-2 ring-surface shadow-sm", badge.className)}
          style={{ width: badgeSize, height: badgeSize }}
          aria-hidden
        >
          <Icon style={{ width: badgeSize * 0.56, height: badgeSize * 0.56 }} />
        </span>
      ) : null}
    </span>
  );
}
