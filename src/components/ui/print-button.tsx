"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "./button";

/** Imprime ou salva em PDF pelo próprio navegador. */
export function PrintButton({ label = "Imprimir ou salvar PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary")}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
