import type { CSSProperties } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Briefcase,
  Car,
  CircleEllipsis,
  CirclePlus,
  CreditCard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Plane,
  Plug,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Sparkle,
  Sparkles,
  TrendingUp,
  Undo2,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/** Ícones das categorias padrão (nomes do lucide gravados no cadastro). */
const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  car: Car,
  "circle-ellipsis": CircleEllipsis,
  "circle-plus": CirclePlus,
  gift: Gift,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  home: House,
  landmark: Landmark,
  "party-popper": PartyPopper,
  "paw-print": PawPrint,
  "piggy-bank": PiggyBank,
  plane: Plane,
  plug: Plug,
  repeat: Repeat,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  sparkle: Sparkle,
  sparkles: Sparkles,
  "trending-up": TrendingUp,
  utensils: Utensils,
};

const KIND_FALLBACK: Record<string, { icon: LucideIcon; color: string }> = {
  income: { icon: ArrowDownLeft, color: "#0e7a4f" },
  refund: { icon: Undo2, color: "#0e7a4f" },
  expense: { icon: CircleEllipsis, color: "#5e6b7e" },
  transfer: { icon: ArrowLeftRight, color: "#2357c9" },
  card_payment: { icon: CreditCard, color: "#0b6f70" },
};

/**
 * Ícone da movimentação: o da categoria (com a cor dela) ou, sem categoria, um ícone pelo tipo.
 * No tema escuro a cor é clareada para manter contraste com o fundo.
 */
export function CategoryIcon({ kind, icon, color, className }: { kind: string; icon?: string | null; color?: string | null; className?: string }) {
  const fallback = KIND_FALLBACK[kind] ?? KIND_FALLBACK.expense!;
  const useCategory = kind === "income" || kind === "expense" || kind === "refund";
  const Icon = (useCategory && icon ? ICONS[icon] : undefined) ?? fallback.icon;
  const c = (useCategory && color) || fallback.color;
  return (
    <span
      aria-hidden
      style={{ "--c": c } as CSSProperties}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--c)_13%,transparent)] text-[var(--c)] dark:bg-[color-mix(in_oklab,var(--c)_22%,transparent)] dark:text-[color-mix(in_oklab,var(--c)_55%,white)]",
        className,
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.9} />
    </span>
  );
}
