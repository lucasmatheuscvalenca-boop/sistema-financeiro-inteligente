"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "./button";

/** Copia um texto (ex.: Pix copia e cola) e confirma no próprio botão. */
export function CopyButton({ text, label = "Copiar", copiedLabel = "Copiado" }: { text: string; label?: string; copiedLabel?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("petrol")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />} <span aria-live="polite">{done ? copiedLabel : label}</span>
    </button>
  );
}
