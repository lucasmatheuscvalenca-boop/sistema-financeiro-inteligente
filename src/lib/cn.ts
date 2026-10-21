import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Junta classes resolvendo conflitos do Tailwind (a última vence: “rounded-xl rounded-full” → “rounded-full”). */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Tokens próprios do design system (cores semânticas e sombras com variáveis CSS).
      shadow: [{ shadow: [(v: string) => v.startsWith("[var(--shadow")] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
