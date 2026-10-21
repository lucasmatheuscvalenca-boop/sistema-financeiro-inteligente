"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatDateBR, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/components/ui/form";
import type { CategoryOption, Option } from "./types";

interface PreviewRow {
  index: number;
  date: string;
  description: string;
  amountCents: number;
  action: "import" | "duplicate" | "match";
  reason?: string;
  existingDescription?: string;
  suggestedKind: "income" | "expense" | "refund" | "card_payment_credit";
  suggestedCategoryId: string | null;
}
interface Preview {
  target: { type: "account" | "card"; name: string };
  rows: PreviewRow[];
  errors: Array<{ line: number; message: string }>;
  summary: { total: number; toImport: number; duplicates: number; matches: number };
  meta: Record<string, string | undefined>;
}

/** Decodifica o arquivo: tenta UTF-8 e cai para Windows-1252 (comum em OFX de bancos brasileiros). */
async function readFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

export function ImportWizard({ accounts, cards, categories, previewAction, commitAction }: { accounts: Option[]; cards: Option[]; categories: CategoryOption[]; previewAction: FormAction; commitAction: FormAction }) {
  const [target, setTarget] = useState<string>(accounts[0] ? `account:${accounts[0].id}` : cards[0] ? `card:${cards[0].id}` : "");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<number, { action: "import" | "skip" | "reconcile"; categoryId: string | null }>>({});
  const [previewState, setPreviewState] = useState<ActionState>(initialActionState);
  const [commitState, setCommitState] = useState<ActionState>(initialActionState);
  const [pending, startTransition] = useTransition();

  const fd = useMemo(() => {
    const f = new FormData();
    if (!file) return f;
    const [type, id] = target.split(":");
    f.set("fileName", file.name);
    f.set("content", file.content);
    f.set(type === "card" ? "cardId" : "accountId", id ?? "");
    return f;
  }, [file, target]);

  const submitPreview = () =>
    startTransition(async () => {
      const r = await previewAction(initialActionState, fd);
      setPreviewState(r);
      if (!r.ok || !r.data) return;
      const p = r.data as Preview;
      setPreview(p);
      // Sugestão inicial: concilia previstos, ignora duplicados e pagamentos de fatura; o resto é importado.
      setChoices(
        Object.fromEntries(
          p.rows.map((row) => [row.index, { action: row.action === "match" ? "reconcile" : row.action === "duplicate" || row.suggestedKind === "card_payment_credit" ? "skip" : "import", categoryId: row.suggestedCategoryId }]),
        ),
      );
    });
  const submitCommit = () => {
    const f = new FormData();
    fd.forEach((v, k) => f.set(k, v));
    f.set("choices", JSON.stringify(Object.entries(choices).map(([index, c]) => ({ index: Number(index), action: c.action, categoryId: c.categoryId }))));
    startTransition(async () => setCommitState(await commitAction(initialActionState, f)));
  };

  if (commitState.ok) {
    return (
      <Callout tone="positive" title="Importação concluída" action={<Link href="/movimentacoes" className={buttonClass("secondary", "sm")}>Ver movimentações</Link>}>
        {commitState.message}
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Importar para</span>
          <select value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); }} className="block h-10 w-full rounded-xl border border-line bg-surface px-3">
            {accounts.length ? (
              <optgroup label="Contas">
                {accounts.map((a) => (
                  <option key={a.id} value={`account:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {cards.length ? (
              <optgroup label="Cartões (fatura)">
                {cards.map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm hover:bg-surface-2">
          <FileUp className="size-5 text-petrol-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{file ? file.name : "Escolher arquivo OFX ou CSV"}</span>
            <span className="text-xs text-muted">Até 2 MB. O arquivo é lido no navegador e processado no servidor; senhas bancárias nunca são pedidas.</span>
          </span>
          <input
            type="file"
            accept=".ofx,.csv,.txt,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2_000_000) {
                alert("Arquivo maior que 2 MB.");
                return;
              }
              setFile({ name: f.name, content: await readFile(f) });
              setPreview(null);
            }}
          />
        </label>
      </div>
      <button type="button" disabled={!file || !target || pending} onClick={submitPreview} className={buttonClass("primary")}>
        {pending && !preview ? "Analisando…" : "Pré-visualizar"}
      </button>
      {previewState.error ? <Callout tone="negative">{previewState.error}</Callout> : null}
      {preview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="positive">{preview.summary.toImport} novo(s)</Badge>
            <Badge tone="info">{preview.summary.matches} possível(is) conciliação(ões)</Badge>
            <Badge>{preview.summary.duplicates} duplicado(s) — serão ignorados</Badge>
            {preview.errors.length ? <Badge tone="warning">{preview.errors.length} linha(s) com erro</Badge> : null}
          </div>
          {preview.errors.length ? (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Ver linhas com erro</summary>
              <ul className="mt-1 space-y-0.5">
                {preview.errors.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    Linha {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="max-h-[480px] overflow-auto rounded-2xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Ação</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((r) => {
                  const c = choices[r.index];
                  const kind = r.suggestedKind === "income" ? "income" : "expense";
                  return (
                    <tr key={r.index} className={r.action === "duplicate" ? "opacity-50" : ""}>
                      <td className="px-3 py-2 text-muted">{formatDateBR(r.date)}</td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.amountCents < 0 ? "text-negative" : "text-positive"}`}>{formatMoney(r.amountCents)}</td>
                      <td className="px-3 py-2">
                        {r.action === "duplicate" ? (
                          <Badge>Já existe</Badge>
                        ) : r.action === "match" ? (
                          <Badge tone="info" title={r.existingDescription}>
                            Parece com “{r.existingDescription}”
                          </Badge>
                        ) : r.suggestedKind === "card_payment_credit" ? (
                          <Badge tone="warning">Pagamento de fatura</Badge>
                        ) : (
                          <Badge tone="positive">Novo</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.action === "duplicate" ? (
                          <span className="text-xs text-muted">Ignorar</span>
                        ) : (
                          <select
                            value={c?.action}
                            onChange={(e) => setChoices((s) => ({ ...s, [r.index]: { ...s[r.index]!, action: e.target.value as "import" | "skip" | "reconcile" } }))}
                            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
                            aria-label="Ação"
                          >
                            {r.action === "match" ? <option value="reconcile">Conciliar com existente</option> : null}
                            {r.suggestedKind !== "card_payment_credit" ? <option value="import">Importar como novo</option> : null}
                            <option value="skip">Ignorar</option>
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {c?.action === "import" ? (
                          <select
                            value={c.categoryId ?? ""}
                            onChange={(e) => setChoices((s) => ({ ...s, [r.index]: { ...s[r.index]!, categoryId: e.target.value || null } }))}
                            className="h-8 max-w-44 rounded-lg border border-line bg-surface px-2 text-xs"
                            aria-label="Categoria"
                          >
                            <option value="">Sem categoria</option>
                            {categories
                              .filter((x) => x.kind === kind)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.label}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Duplicatas são verificadas de novo no servidor ao confirmar: reimportar o mesmo arquivo não cria lançamentos repetidos.</p>
            <button type="button" disabled={pending} onClick={submitCommit} className={buttonClass("petrol")}>
              {pending ? "Importando…" : "Confirmar importação"}
            </button>
          </div>
          {commitState.error ? <Callout tone="negative">{commitState.error}</Callout> : null}
        </div>
      ) : null}
    </div>
  );
}
