import { cn } from "@/lib/cn";

/** Avatar com iniciais (não guardamos fotos do usuário). */
export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-petrol-400 to-navy-700 font-semibold text-white ring-2 ring-white/70 dark:ring-white/10", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
