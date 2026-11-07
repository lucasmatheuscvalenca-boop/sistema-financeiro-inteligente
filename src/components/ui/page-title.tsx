"use client";

import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Título da tela com a explicação recolhida num botão ⓘ: a primeira tela do celular fica para o
 * conteúdo, e quem quiser entender a tela toca no botão.
 */
export function PageTitle({ title, description }: { title: ReactNode; description?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <h1 className="text-[28px] sm:text-[34px]">{title}</h1>
        {description ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            aria-label={open ? "Esconder a explicação desta tela" : "Sobre esta tela"}
            title="Sobre esta tela"
            onClick={() => setOpen((v) => !v)}
            className={cn("grid size-8 shrink-0 place-items-center rounded-full border transition hover:text-ink", open ? "border-accent text-link" : "border-line text-muted")}
          >
            <Info className="size-4" />
          </button>
        ) : null}
      </div>
      {description ? (
        <p id={id} hidden={!open} className="mt-1.5 max-w-2xl text-sm text-muted sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
