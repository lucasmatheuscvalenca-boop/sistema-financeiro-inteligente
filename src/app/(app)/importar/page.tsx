import type { Metadata } from "next";
import { commitImportAction, previewImportAction } from "../_actions/finance";
import { ImportWizard } from "@/components/finance/import-wizard";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { formatDateBR } from "@/domain/dates";
import { requireOnboarded } from "@/server/auth/current";
import { listImportBatches } from "@/server/services/imports";
import { formLookups } from "@/server/services/lookups";

export const metadata: Metadata = { title: "Importar extrato" };

export default async function ImportPage() {
  const { ctx } = await requireOnboarded();
  const [lookups, batches] = await Promise.all([formLookups(ctx), listImportBatches(ctx)]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Central financeira" title="Importar extrato" description="Arquivos OFX (padrão dos bancos) ou CSV. Você revisa antes de gravar; duplicatas são ignoradas e lançamentos manuais equivalentes podem ser conciliados." />
      {lookups.accounts.length === 0 && lookups.cards.length === 0 ? (
        <EmptyState title="Cadastre uma conta ou cartão primeiro" description="A importação precisa de um destino." action={<ButtonLink href="/contas">Cadastrar conta</ButtonLink>} />
      ) : (
        <Card>
          <CardBody className="pt-5">
            <ImportWizard accounts={lookups.accounts} cards={lookups.cards} categories={lookups.categories} previewAction={previewImportAction} commitAction={commitImportAction} />
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Como exportar do seu banco" />
        <CardBody className="space-y-2 text-sm text-muted">
          <p>• No app ou internet banking, procure por “extrato” → “exportar” → formato OFX (Money/Quicken) ou CSV.</p>
          <p>• Para cartões, exporte a fatura em OFX ou CSV e escolha o cartão como destino: compras viram despesas na fatura certa e pagamentos de fatura são ignorados (eles já aparecem na conta).</p>
          <p>• CSV precisa de colunas de data, descrição e valor (ou débito e crédito). Os formatos 31/12/2026 e 1.234,56 são reconhecidos.</p>
        </CardBody>
      </Card>
      {batches.length ? (
        <Card>
          <CardHeader title="Importações anteriores" />
          <CardBody>
            <ul className="divide-y divide-line text-sm">
              {[...batches].reverse().slice(0, 10).map((b) => (
                <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {b.fileName} <span className="text-muted">· {formatDateBR(b.createdAt.toISOString().slice(0, 10))}</span>
                  </span>
                  <span className="text-muted">
                    {b.imported} importado(s) · {b.matched} conciliado(s) · {b.duplicates} duplicado(s)
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
