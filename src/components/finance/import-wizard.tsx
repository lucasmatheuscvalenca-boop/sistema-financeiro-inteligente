"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, FileUp } from "lucide-react";
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
interface Totals {
  fileInCents: number;
  fileOutCents: number;
  incomeCents: number;
  expenseCents: number;
  movedCents: number;
  alreadyCents: number;
  attention: number;
}
interface Preview {
  target: { type: "account" | "card"; id: string; name: string };
  rows: PreviewRow[];
  errors: Array<{ line: number; message: string }>;
  ignored: Array<{ line: number; message: string }>;
  signsInverted: boolean;
  statementBalance: { balanceCents: number; date: string } | null;
  summary: { total: number; toImport: number; duplicates: number; matches: number };
  totals: Totals;
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

/** Linha em que o app chutou e vale um olhar: sem categoria, transferência ou pagamento deduzidos, parcela deslocada. */
function needsAttention(r: PreviewRow): boolean {
  if (r.action !== "import") return false;
  if (r.suggestedKind === "transfer" || r.suggestedKind === "card_payment" || r.suggestedKind === "card_payment_credit") return true;
  if ((r.suggestedKind === "income" || r.suggestedKind === "expense") && !r.suggestedCategoryId) return true;
  return !!r.originalDate;
}

/** Decodifica o arquivo: tenta UTF-8 e cai para Windows-1252 (comum em OFX de bancos brasileiros). */
async function readFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

const selectClass = "h-8 max-w-48 rounded-lg border border-field-line bg-field px-2 text-xs";

function ConferenceTable({ totals: t, fileName, rows }: { totals: Totals; fileName: string; rows: number }) {
  return (
    <div>
      <p className="text-xs text-muted">
        {fileName} · {plural(rows, "lançamento", "lançamentos")}
      </p>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm sm:grid-cols-[1fr_auto_1fr_auto]">
        <span className="text-muted">Entradas no arquivo</span>
        <span className="text-right font-semibold tabular-nums">{formatMoney(t.fileInCents)}</span>
        <span className="text-muted">Saídas no arquivo</span>
        <span className="text-right font-semibold tabular-nums">{formatMoney(t.fileOutCents)}</span>
        <span className="text-muted">Vai entrar como receita</span>
        <span className="text-right font-semibold tabular-nums text-positive">{formatMoney(t.incomeCents)}</span>
        <span className="text-muted">Vai entrar como despesa</span>
        <span className="text-right font-semibold tabular-nums text-negative">{formatMoney(t.expenseCents)}</span>
        <span className="text-muted">Só muda de lugar (fatura, transferência)</span>
        <span className="text-right tabular-nums">{formatMoney(t.movedCents)}</span>
        <span className="text-muted">Já lançado (vai conciliar) ou duplicado</span>
        <span className="text-right tabular-nums">{formatMoney(t.alreadyCents)}</span>
      </div>
    </div>
  );
}

function RowEditor({ r, choice, isCard, cards, otherAccounts, categories, onChange }: { r: PreviewRow; choice: Choice; isCard: boolean; cards: Option[]; otherAccounts: Option[]; categories: CategoryOption[]; onChange: (patch: Partial<Choice>) => void }) {
  const c = choice;
  const options = kindOptions(isCard, r.amountCents, cards.length > 0, otherAccounts.length > 0);
  const categoryKind = c.kind === "income" ? "income" : "expense";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {r.action === "duplicate" ? (
        <span className="text-xs text-muted">Já existe, ignorada</span>
      ) : (
        <select value={c.action} onChange={(e) => onChange({ action: e.target.value as Choice["action"] })} className={selectClass} aria-label="Ação">
          {r.action === "match" ? <option value="reconcile">Conciliar com existente</option> : null}
          {c.kind !== "card_payment_credit" ? <option value="import">Importar</option> : null}
          <option value="skip">Ignorar</option>
        </select>
      )}
      {r.action === "duplicate" || c.action !== "import" ? null : options.length > 1 ? (
        <select
          value={c.kind}
          onChange={(e) => {
            const kind = e.target.value as ImportKind;
            onChange({
              kind,
              action: kind === "card_payment_credit" ? "skip" : c.action,
              cardId: kind === "card_payment" && !isCard ? (c.cardId ?? cards[0]?.id ?? null) : c.cardId,
              accountId: kind === "transfer" || (kind === "card_payment" && isCard) ? (c.accountId ?? otherAccounts[0]?.id ?? null) : c.accountId,
            });
          }}
          className={selectClass}
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
      {c.action !== "import" ? null : c.kind === "card_payment" && isCard ? (
        <select value={c.accountId ?? ""} onChange={(e) => onChange({ accountId: e.target.value || null })} className={selectClass} aria-label="Conta que pagou">
          {otherAccounts.map((x) => (
            <option key={x.id} value={x.id}>
              pago com {x.name}
            </option>
          ))}
        </select>
      ) : c.kind === "card_payment" ? (
        <select value={c.cardId ?? ""} onChange={(e) => onChange({ cardId: e.target.value || null })} className={selectClass} aria-label="Cartão pago">
          {cards.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      ) : c.kind === "transfer" ? (
        <select value={c.accountId ?? ""} onChange={(e) => onChange({ accountId: e.target.value || null })} className={selectClass} aria-label={r.amountCents < 0 ? "Conta de destino" : "Conta de origem"}>
          {otherAccounts.map((x) => (
            <option key={x.id} value={x.id}>
              {r.amountCents < 0 ? "para " : "de "}
              {x.name}
            </option>
          ))}
        </select>
      ) : c.kind === "card_payment_credit" ? null : (
        <select
          value={c.categoryId ?? ""}
          onChange={(e) => onChange({ categoryId: e.target.value || null })}
          className={`${selectClass} ${!c.categoryId ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100" : ""}`}
          aria-label="Categoria"
        >
          <option value="">Qual categoria?</option>
          {categories
            .filter((x) => x.kind === categoryKind)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
        </select>
      )}
    </div>
  );
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

  const formData = (f: { name: string; content: string }, t: string) => {
    const fd = new FormData();
    const [type, id] = t.split(":");
    fd.set("fileName", f.name);
    fd.set("content", f.content);
    fd.set(type === "card" ? "cardId" : "accountId", id ?? "");
    return fd;
  };

  // O arquivo escolhido já é lido e conferido; nada é gravado antes de confirmar.
  const analyze = (f: { name: string; content: string }, t: string) =>
    startTransition(async () => {
      const r = await previewAction(initialActionState, formData(f, t));
      setPreviewState(r);
      if (!r.ok || !r.data) {
        setPreview(null);
        return;
      }
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
    if (!file) return;
    const fd = formData(file, target);
    fd.set("choices", JSON.stringify(Object.entries(choices).map(([index, c]) => ({ index: Number(index), ...c }))));
    if (preview?.statementBalance && alignBalance) fd.set("alignBalance", "1");
    startTransition(async () => setCommitState(await commitAction(initialActionState, fd)));
  };

  const isCard = preview?.target.type === "card";
  const otherAccounts = accounts.filter((a) => !(preview?.target.type === "account" && a.id === preview.target.id));
  const attention = useMemo(() => (preview ? preview.rows.filter(needsAttention) : []), [preview]);
  const active = preview ? preview.rows.filter((r) => r.action !== "duplicate" && choices[r.index]?.action === "import") : [];
  const transfers = active.filter((r) => choices[r.index]?.kind === "transfer").length;
  const cardPayments = active.filter((r) => choices[r.index]?.kind === "card_payment").length;
  const patch = (index: number) => (p: Partial<Choice>) => setChoices((s) => ({ ...s, [index]: { ...s[index]!, ...p } }));

  if (commitState.ok && preview) {
    return (
      <div className="space-y-4">
        <Callout tone="positive" title="Extrato conferido e gravado" action={<Link href="/movimentacoes" className={buttonClass("secondary", "sm")}>Ver lançamentos</Link>}>
          {commitState.message}
        </Callout>
        <div className="rounded-lg border border-line bg-surface-2/60 p-4 text-sm">
          <ConferenceTable totals={preview.totals} fileName={file?.name ?? ""} rows={preview.rows.length} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gastos" className={buttonClass("petrol")}>
            Ver gastos por categoria
          </Link>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setPreview(null);
              setCommitState(initialActionState);
            }}
            className={buttonClass("secondary")}
          >
            Importar outro extrato
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Importar para</span>
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              if (file) analyze(file, e.target.value);
            }}
            className="block h-10 w-full rounded-xl border border-field-line bg-field px-3"
          >
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
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3 text-sm hover:bg-surface-2">
          <FileUp className="size-5 text-petrol-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{file ? file.name : "Escolher o arquivo OFX ou CSV"}</span>
            <span className="text-xs text-muted">{pending && !preview ? "Lendo o extrato…" : "A conferência aparece na hora. Nada é gravado até você confirmar."}</span>
          </span>
          <input
            type="file"
            accept=".ofx,.csv,.txt,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2_000_000) {
                setPreviewState({ ...initialActionState, error: "Arquivo maior que 2 MB. Exporte um período menor." });
                return;
              }
              const next = { name: f.name, content: await readFile(f) };
              setFile(next);
              setCommitState(initialActionState);
              analyze(next, target);
            }}
          />
        </label>
      </div>
      {previewState.error ? <Callout tone="negative">{previewState.error}</Callout> : null}

      {preview ? (
        <div className="space-y-4">
          {/* 1. Conferência: o que está no arquivo e o que o Meu Banqueiro vai gravar. */}
          <section className="rounded-lg border border-line bg-surface-2/60 p-4 text-sm">
            <ConferenceTable totals={preview.totals} fileName={file?.name ?? ""} rows={preview.rows.length} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="positive">{plural(preview.summary.toImport, "novo", "novos")}</Badge>
              {preview.summary.matches ? <Badge tone="info">{preview.summary.matches === 1 ? "1 conciliação com lançamento seu" : `${preview.summary.matches} conciliações com lançamentos seus`}</Badge> : null}
              {preview.summary.duplicates ? <Badge>{preview.summary.duplicates === 1 ? "1 já estava gravado" : `${preview.summary.duplicates} já estavam gravados`}</Badge> : null}
              {transfers ? <Badge tone="info">{plural(transfers, "transferência entre contas", "transferências entre contas")}</Badge> : null}
              {cardPayments ? <Badge tone="info">{plural(cardPayments, "pagamento de fatura", "pagamentos de fatura")}</Badge> : null}
              {preview.errors.length ? <Badge tone="warning">{plural(preview.errors.length, "linha", "linhas")} com erro</Badge> : null}
            </div>
            {preview.signsInverted ? <p className="mt-2 text-xs text-muted">Nesta fatura as compras vinham com valor positivo: entram como despesa, e os créditos como estorno.</p> : null}
            {preview.errors.length || preview.ignored.length ? (
              <details className="mt-2 text-xs text-muted">
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
          </section>

          {preview.statementBalance ? (
            <label className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={alignBalance} onChange={(e) => setAlignBalance(e.target.checked)} />
              <span>
                <span className="font-medium">
                  Deixar o saldo de {preview.target.name} igual ao do extrato: {formatMoney(preview.statementBalance.balanceCents)}
                </span>
                <span className="block text-xs text-muted">É o saldo que o banco informa no fim de {formatDateBR(preview.statementBalance.date)}. Lançamentos posteriores continuam somando normalmente.</span>
              </span>
            </label>
          ) : null}

          {/* 2. Só o que pede decisão. */}
          {attention.length ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="text-sm font-semibold">{attention.length === 1 ? "1 linha pede sua atenção" : `${attention.length} linhas pedem sua atenção`}</h3>
              <p className="mt-0.5 text-xs text-muted">O resto já está certo. Aqui o app deduziu algo (transferência, pagamento de fatura, parcela) ou não achou a categoria.</p>
              <ul className="mt-3 space-y-3">
                {attention.map((r) => (
                  <li key={r.index} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 text-sm font-medium">
                        {r.description}
                        {r.installment ? (
                          <span className="ml-1.5 text-xs font-normal text-muted">
                            parcela {r.installment.number}/{r.installment.of}
                          </span>
                        ) : null}
                      </span>
                      <span className={`text-sm font-semibold tabular-nums ${r.amountCents < 0 ? "text-negative" : "text-positive"}`}>{formatMoney(r.amountCents)}</span>
                    </div>
                    <p className="mb-2 text-xs text-muted">
                      {formatDateBR(r.date)}
                      {r.originalDate ? ` · compra em ${formatDateBR(r.originalDate)}, levada para a fatura da parcela` : ""}
                      {r.suggestedKind === "transfer" ? " · parece dinheiro entre suas contas" : r.suggestedKind === "card_payment" ? " · parece pagamento de fatura" : r.suggestedKind === "card_payment_credit" ? " · pagamento recebido pela fatura" : ""}
                    </p>
                    {choices[r.index] ? <RowEditor r={r} choice={choices[r.index]!} isCard={isCard} cards={cards} otherAccounts={otherAccounts} categories={categories} onChange={patch(r.index)} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm text-positive">
              <Check className="size-4" /> Todas as linhas foram reconhecidas e categorizadas.
            </p>
          )}

          {/* 3. A lista completa, para quem quiser conferir linha por linha. */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-link">
              <span className="group-open:hidden">Ver todas as {preview.rows.length} linhas ›</span>
              <span className="hidden group-open:inline">Esconder as linhas</span>
            </summary>
            <div className="scroll-hint mt-2 max-h-[520px] overflow-y-auto rounded-lg border border-line">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Situação</th>
                    <th className="px-3 py-2 font-medium">O que fazer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((r) => (
                    <tr key={r.index} className={r.action === "duplicate" ? "opacity-50" : ""}>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {formatDateBR(r.date)}
                        {r.originalDate ? <span className="block text-[11px]">compra em {formatDateBR(r.originalDate)}</span> : null}
                      </td>
                      <td className="min-w-48 px-3 py-2">
                        {r.description}
                        {r.installment ? (
                          <span className="ml-1.5 text-xs text-muted">
                            parcela {r.installment.number}/{r.installment.of}
                          </span>
                        ) : null}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.amountCents < 0 ? "text-negative" : "text-positive"}`}>{formatMoney(r.amountCents)}</td>
                      <td className="px-3 py-2">
                        {r.action === "duplicate" ? (
                          <Badge>Já existe</Badge>
                        ) : r.action === "match" ? (
                          <Badge tone="info" title={r.existingDescription}>
                            Parece com “{r.existingDescription}”
                          </Badge>
                        ) : r.recurrence && choices[r.index]?.kind === r.suggestedKind ? (
                          <Badge tone="info" title={`Realiza a recorrência prevista para ${formatDateBR(r.recurrence.occurrenceDate)}`}>
                            Previsto: {r.recurrence.description}
                          </Badge>
                        ) : (
                          <Badge tone="positive">Novo</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">{choices[r.index] ? <RowEditor r={r} choice={choices[r.index]!} isCard={isCard} cards={cards} otherAccounts={otherAccounts} categories={categories} onChange={patch(r.index)} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">Duplicatas são verificadas de novo no servidor ao confirmar. Se algo sair errado, “Desfazer” na lista de importações volta tudo.</p>
            <button type="button" disabled={pending} onClick={submitCommit} className={buttonClass("petrol")}>
              {pending ? "Gravando…" : "Confirmar e gravar"}
            </button>
          </div>
          {commitState.error ? <Callout tone="negative">{commitState.error}</Callout> : null}
        </div>
      ) : null}
    </div>
  );
}
