import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full rounded-md border border-navy-600 bg-navy-950/60 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-[var(--accent)] focus:outline-none";

export function Field({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <input className={inputClass} {...props} />
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <textarea className={cn(inputClass, "min-h-20")} {...props} />
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export { inputClass };
