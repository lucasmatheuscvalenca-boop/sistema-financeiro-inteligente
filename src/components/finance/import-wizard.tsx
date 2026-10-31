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
import { plural } from "@/domain/text";

type ImportKind = "income" | "expense" | "refund" | "transfer" | "card_payment" | "card_payment_credit";

interface PreviewRow {
  index: number;
  date: string;
  originalDate?: string;
  description: string;
  amountCents: number;
  action: "import" | "duplicate" | "match";
  reason?: string;
  existingDescription?: string;
  suggestedKind: ImportKind;
  suggestedCardId: string | null;
  suggestedAccountId: string | null;
  suggestedCategoryId: string | null;
  installment: { number: number; of: number } | null;
  recurrence: { id: string; occurrenceDate: string; description: string } | null;
}
interface Preview {
  target: { type: "account" | "card"; id: string; name: string };
  rows: PreviewRow[];
  errors: Array<{ line: number; message: string }>;
  ignored: Array<{ line: number; message: string }>;
  signsInverted: boolean;
  statementBalance: { balanceCents: number; date: string } | null;
  summary: { total: number; toImport: number; duplicates: number; matches: number };
  meta: Record<string, string | undefined>;
}
interface Choice {
  action: "import" | "skip" | "reconcile";
  kind: ImportKind;
  cardId: string | null;
  accountId: string | null;
  categoryId: string | null;
}

const KIND_LABEL: Record<ImportKind, string> = {
  expense: "Despesa",
  income: "Receita",
  refund: "Estorno / devolução",
  transfer: "Transferência entre contas",
  card_payment: "Pagamento de fatura",
  card_payment_credit: "Pagamento (não registrar)",
};

/** Mesmas regras do servidor: o tipo depende do destino e do sinal do valor. */
function kindOptions(isCard: boolean, amountCents: number, hasCards: boolean, hasOtherAccounts: boolean): ImportKind[] {
  if (isCard) return amountCents < 0 ? ["expense"] : hasOtherAccounts ? ["refund", "card_payment", "card_payment_credit"] : ["refund", "card_payment_credit"];
  const base: ImportKind[] = amountCents < 0 ? ["expense"] : ["income", "refund"];
  if (amountCents < 0 && hasCards) base.push("card_payment");
  if (hasOtherAccounts) base.push("transfer");
  return base;
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
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [alignBalance, setAlignBalance] = useState(true);
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
      // Sugestão inicial: concilia previstos, ignora duplicados e pagamentos vistos na fatura; o resto é importado.
      setChoices(
        Object.fromEntries(
          p.rows.map((row) => [
            row.index,
            {
              action: row.action === "match" ? "reconcile" : row.action === "duplicate" || row.suggestedKind === "card_payment_credit" ? "skip" : "import",
              kind: row.suggestedKind,
              cardId: row.suggestedCardId,
              accountId: row.suggestedAccountId,
              categoryId: row.suggestedCategoryId,
            },
          ]),
        ),
      );
      setAlignBalance(true);
    });
  const submitCommit = () => {
    const f = new FormData();
    fd.forEach((v, k) => f.set(k, v));
    f.set("choices", JSON.stringify(Object.entries(choices).map(([index, c]) => ({ index: Number(index), ...c }))));
    if (preview?.statementBalance && alignBalance) f.set("alignBalance", "1");
    startTransition(async () => setCommitState(await commitAction(initialActionState, f)));
  };

  const isCard = preview?.target.type === "card";
  const otherAccounts = accounts.filter((a) => !(preview?.target.type === "account" && a.id === preview.target.id));
  const active = preview ? preview.rows.filter((r) => r.action !== "duplicate" && choices[r.index]?.action === "import") : [];
  const transfers = active.filter((r) => choices[r.index]?.kind === "transfer").length;
  const cardPayments = active.filter((r) => choices[r.index]?.kind === "card_payment").length;

  if (commitState.ok) {
    return (
      <Callout tone="positive" title="Importação concluída" action={<Link href="/movimentacoes" className={buttonClass("secondary", "sm")}>Ver movimentações</Link>}>
        {commitState.message}
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Importar para</span>
          <select value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); }} className="block h-10 w-full rounded-xl border border-field-line bg-field px-3">
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
            <Badge tone="positive">{plural(preview.summary.toImport, "novo", "novos")}</Badge>
            <Badge tone="info">{preview.summary.matches === 1 ? "1 possível conciliação" : `${preview.summary.matches} possíveis conciliações`}</Badge>
            <Badge>{preview.summary.duplicates === 1 ? "1 duplicado — será ignorado" : `${preview.summary.duplicates} duplicados — serão ignorados`}</Badge>
            {transfers ? <Badge tone="info">{plural(transfers, "transferência entre contas", "transferências entre contas")}</Badge> : null}
            {cardPayments ? <Badge tone="info">{plural(cardPayments, "pagamento de fatura", "pagamentos de fatura")}</Badge> : null}
            {preview.errors.length ? <Badge tone="warning">{plural(preview.errors.length, "linha", "linhas")} com erro</Badge> : null}
          </div>
          {preview.signsInverted ? (
            <Callout tone="info" title="Sinal das compras ajustado">
              Nesta fatura as compras vinham com valor positivo. Elas entram como despesa, e os créditos como estorno.
            </Callout>
          ) : null}
          {transfers || cardPayments ? (
            <p className="text-xs text-muted">
              Transferências entre suas contas e pagamentos de fatura não contam como receita nem despesa: a compra já foi contada no cartão e o dinheiro só mudou de lugar. Confira o tipo de cada linha antes de confirmar.
            </p>
          ) : null}
          {preview.statementBalance ? (
            <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={alignBalance} onChange={(e) => setAlignBalance(e.target.checked)} />
              <span>
                <span className="font-medium">
                  Acertar o saldo de {preview.target.name} para {formatMoney(preview.statementBalance.balanceCents)}
                </span>
                <span className="block text-xs text-muted">É o saldo que o extrato informa no fim de {formatDateBR(preview.statementBalance.date)}. Lançamentos posteriores continuam somando normalmente.</span>
              </span>
            </label>
          ) : null}
          {preview.errors.length || preview.ignored.length ? (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">
                {[preview.errors.length ? plural(preview.errors.length, "linha com erro", "linhas com erro") : "", preview.ignored.length ? plural(preview.ignored.length, "linha de saldo ou valor zero ignorada", "linhas de saldo ou valor zero ignoradas") : ""].filter(Boolean).join(" · ")}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {[...preview.errors, ...preview.ignored].slice(0, 40).map((e, i) => (
                  <li key={i}>
                    Linha {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="scroll-hint max-h-[520px] overflow-y-auto rounded-2xl border border-line">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Ação</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Categoria, cartão ou conta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((r) => {
                  const c = choices[r.index];
                  const options = kindOptions(isCard, r.amountCents, cards.length > 0, otherAccounts.length > 0);
                  const set = (patch: Partial<Choice>) => setChoices((s) => ({ ...s, [r.index]: { ...s[r.index]!, ...patch } }));
                  const categoryKind = c?.kind === "income" ? "income" : "expense";
                  return (
                    <tr key={r.index} className={r.action === "duplicate" ? "opacity-50" : ""}>
                      <td className="px-3 py-2 text-muted">
                        {formatDateBR(r.date)}
                        {r.originalDate ? <span className="block text-[11px]">compra em {formatDateBR(r.originalDate)}</span> : null}
                      </td>
                      <td className="min-w-48 px-3 py-2">
                        {r.description}
                        {r.installment ? <span className="ml-1.5 text-xs text-muted">parcela {r.installment.number}/{r.installment.of}</span> : null}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.amountCents < 0 ? "text-negative" : "text-positive"}`}>{formatMoney(r.amountCents)}</td>
                      <td className="px-3 py-2">
                        {r.action === "duplicate" ? (
                          <Badge>Já existe</Badge>
                        ) : r.action === "match" ? (
                          <Badge tone="info" title={r.existingDescription}>
                            Parece com “{r.existingDescription}”
                          </Badge>
                        ) : r.recurrence && c?.kind === r.suggestedKind ? (
                          <Badge tone="info" title={`Realiza a recorrência prevista para ${formatDateBR(r.recurrence.occurrenceDate)}`}>
                            Previsto: {r.recurrence.description}
                          </Badge>
                        ) : (
                          <Badge tone="positive">Novo</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.action === "duplicate" ? (
                          <span className="text-xs text-muted">Ignorar</span>
                        ) : (
                          <select value={c?.action} onChange={(e) => set({ action: e.target.value as Choice["action"] })} className="h-8 rounded-lg border border-field-line bg-field px-2 text-xs" aria-label="Ação">
                            {r.action === "match" ? <option value="reconcile">Conciliar com existente</option> : null}
                            {c?.kind !== "card_payment_credit" ? <option value="import">Importar</option> : null}
                            <option value="skip">Ignorar</option>
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.action === "duplicate" || c?.action !== "import" ? null : options.length > 1 ? (
                          <select
                            value={c.kind}
                            onChange={(e) => {
                              const kind = e.target.value as ImportKind;
                              set({
                                kind,
                                action: kind === "card_payment_credit" ? "skip" : c.action,
                                cardId: kind === "card_payment" && !isCard ? (c.cardId ?? cards[0]?.id ?? null) : c.cardId,
                                accountId: kind === "transfer" || (kind === "card_payment" && isCard) ? (c.accountId ?? otherAccounts[0]?.id ?? null) : c.accountId,
                              });
                            }}
                            className="h-8 max-w-48 rounded-lg border border-field-line bg-field px-2 text-xs"
                            aria-label="Tipo"
                          >
                            {options.map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABEL[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs">{isCard ? "Compra" : KIND_LABEL[c.kind]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {c?.action !== "import" ? null : c.kind === "card_payment" && isCard ? (
                          <select value={c.accountId ?? ""} onChange={(e) => set({ accountId: e.target.value || null })} className="h-8 max-w-48 rounded-lg border border-field-line bg-field px-2 text-xs" aria-label="Conta que pagou">
                            {otherAccounts.map((x) => (
                              <option key={x.id} value={x.id}>
                                pago com {x.name}
                              </option>
                            ))}
                          </select>
                        ) : c.kind === "card_payment" ? (
                          <select value={c.cardId ?? ""} onChange={(e) => set({ cardId: e.target.value || null })} className="h-8 max-w-48 rounded-lg border border-field-line bg-field px-2 text-xs" aria-label="Cartão pago">
                            {cards.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        ) : c.kind === "transfer" ? (
                          <select value={c.accountId ?? ""} onChange={(e) => set({ accountId: e.target.value || null })} className="h-8 max-w-48 rounded-lg border border-field-line bg-field px-2 text-xs" aria-label={r.amountCents < 0 ? "Conta de destino" : "Conta de origem"}>
                            {otherAccounts.map((x) => (
                              <option key={x.id} value={x.id}>
                                {r.amountCents < 0 ? "para " : "de "}
                                {x.name}
                              </option>
                            ))}
                          </select>
                        ) : c.kind === "card_payment_credit" ? null : (
                          <select value={c.categoryId ?? ""} onChange={(e) => set({ categoryId: e.target.value || null })} className="h-8 max-w-48 rounded-lg border border-field-line bg-field px-2 text-xs" aria-label="Categoria">
                            <option value="">Sem categoria</option>
                            {categories
                              .filter((x) => x.kind === categoryKind)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.label}
                                </option>
                              ))}
                          </select>
                        )}
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
