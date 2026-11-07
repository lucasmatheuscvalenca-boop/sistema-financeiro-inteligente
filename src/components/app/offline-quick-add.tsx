"use client";

import { useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/button";
import { addToQueue, QUEUE_EVENT, readQueue, type OfflineEntry } from "@/lib/offline-queue";

const EMPTY: OfflineEntry[] = [];
let snapshot: OfflineEntry[] = EMPTY;
let raw = "";
function subscribe(cb: () => void) {
  window.addEventListener(QUEUE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(QUEUE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function getSnapshot(): OfflineEntry[] {
  const list = readQueue();
  const next = JSON.stringify(list);
  if (next !== raw) {
    raw = next;
    snapshot = list;
  }
  return snapshot;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Anotar um gasto sem internet: fica no aparelho e é registrado quando a conexão voltar. */
export function OfflineQuickAdd() {
  const queue = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const field = "h-11 w-full rounded-lg border border-field-line bg-field px-3 text-base";
  return (
    <div id="anotar" className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!amount.trim()) return;
          addToQueue({ amount: amount.trim(), description: description.trim() || "Gasto anotado sem internet", date: today() });
          setAmount("");
          setDescription("");
          setSaved(true);
        }}
      >
        <label className="block space-y-1.5 text-sm font-medium">
          Valor (R$)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required className={`${field} tabular-nums`} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          O que foi
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex.: padaria" maxLength={140} className={field} />
        </label>
        <button type="submit" className={buttonClass("petrol")}>
          Anotar
        </button>
        {saved ? (
          <p role="status" className="text-sm text-positive">
            Anotado. Entra nos seus lançamentos quando a internet voltar e você abrir o app.
          </p>
        ) : null}
      </form>
      {queue.length ? (
        <div className="text-sm">
          <p className="font-medium">Esperando a conexão</p>
          <ul className="mt-1 divide-y divide-line">
            {queue.map((q) => (
              <li key={q.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">{q.description}</span>
                <span className="shrink-0 tabular-nums">R$ {q.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
