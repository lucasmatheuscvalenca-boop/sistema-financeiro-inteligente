"use client";

import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

/** Diálogo nativo acessível (foco e Esc tratados pelo navegador). */
export function Dialog({ trigger, title, children, variant = "primary", size = "md", description }: { trigger: ReactNode; title: string; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; description?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-navy-950/50 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" aria-label="Fechar" className="rounded-lg p-1 text-muted hover:bg-surface-2" onClick={() => ref.current?.close()}>
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </dialog>
    </>
  );
}
