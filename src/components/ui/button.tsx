import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "petrol" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background,box-shadow,transform,color,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 whitespace-nowrap";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 shadow-sm dark:bg-accent dark:text-accent-ink dark:hover:brightness-110",
  petrol: "bg-accent text-accent-ink hover:brightness-110 shadow-sm",
  outline: "border border-petrol-500 bg-surface text-link hover:bg-petrol-50 dark:hover:bg-petrol-900/40",
  secondary: "border border-line bg-surface text-ink hover:border-navy-200 hover:bg-surface-2 dark:hover:border-navy-600",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-navy-950",
  gold: "bg-gold-500 text-navy-950 hover:bg-gold-400 shadow-sm",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={props.type ?? "button"} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
