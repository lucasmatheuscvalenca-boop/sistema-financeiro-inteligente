import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Seção editorial: título em serifa com um filete embaixo, ação opcional à direita e o conteúdo
 * direto sobre a página, sem caixa. É a unidade de composição das telas; cartão só quando há
 * motivo (um destaque, um formulário).
 */
export function Section({
  title,
  description,
  href,
  linkLabel,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-ink/80 pb-2 dark:border-line">
        <div className="min-w-0">
          <h2 className="text-[20px]">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-link hover:underline">
            {linkLabel ?? "Ver tudo"} <ChevronRight className="size-4" />
          </Link>
        ) : action ? (
          <div className="shrink-0">{action}</div>
        ) : null}
      </div>
      <div className={cn("pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Linha de lista editorial: conteúdo à esquerda, valor à direita, filete entre linhas. */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-3 border-b border-line py-3 last:border-b-0", className)}>{children}</div>;
}
