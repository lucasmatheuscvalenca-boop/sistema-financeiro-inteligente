import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { archiveAssetAction, archiveDebtAction, saveAssetAction, saveDebtAction } from "../_actions/planning";
import { SingleLineChart } from "@/components/charts/charts";
import { AssetForm, DebtForm } from "@/components/planning/networth-forms";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAction } from "@/components/ui/form";
import { Money, PageHeader, Stat } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { formatDateBR, formatMonthShort } from "@/domain/dates";
import { ASSET_CATEGORY_LABEL, LIABILITY_CATEGORY_LABEL, PROVENANCE_LABEL, type AssetCategory, type LiabilityCategory, type Provenance } from "@/domain/net-worth";
import { centsToInput } from "@/lib/format";
import { requireOnboarded } from "@/server/auth/current";
import { getNetWorth } from "@/server/services/net-worth";

export const metadata: Metadata = { title: "Investimentos e patrimônio" };

const PROV_TONE: Record<Provenance, BadgeTone> = { confirmed: "positive", informed: "info", estimated: "warning", projected: "neutral" };

export default async function NetWorthPage() {
  const { ctx } = await requireOnboarded();
  const nw = await getNetWorth(ctx);
  const s = nw.summary;
  const assets = s.byCategory.filter((c) => c.side === "asset");
  const liabilities = s.byCategory.filter((c) => c.side === "liability");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planejamento"
        title="Investimentos e patrimônio"
        description="Ativos e passivos consolidados. Cada valor mostra a procedência: confirmado, informado ou estimado. Nenhuma cotação é inventada."
        actions={
          <>
            <Dialog trigger={<><Plus className="size-4" /> Bem ou investimento</>} title="Novo bem ou investimento" variant="secondary">
              <AssetForm action={saveAssetAction} today={ctx.today} />
            </Dialog>
            <Dialog trigger={<><Plus className="size-4" /> Dívida</>} title="Nova dívida" variant="secondary">
              <DebtForm action={saveDebtAction} today={ctx.today} />
            </Dialog>
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <Stat label="Patrimônio líquido" value={<Money cents={s.netWorthCents} />} hint={s.estimatedSharePct ? `${s.estimatedSharePct.toFixed(0)}% dos ativos são estimativas` : undefined} />
        </Card>
        <Card className="p-4">
          <Stat label="Ativos" value={<Money cents={s.assetsCents} />} />
        </Card>
        <Card className="p-4">
          <Stat label="Passivos" value={<Money cents={-s.liabilitiesCents} />} />
        </Card>
        <Card className="p-4">
          <Stat label="Ativos com liquidez" value={<Money cents={s.liquidAssetsCents} />} />
        </Card>
      </section>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Distribuição dos ativos" />
          <CardBody className="space-y-3">
            {assets.length === 0 ? <p className="text-sm text-muted">Nenhum ativo registrado.</p> : null}
            {assets.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{c.label}</span>
                  <span className="tabular-nums text-muted">
                    <Money cents={c.valueCents} tone="none" /> · {c.sharePct.toFixed(0)}%
                  </span>
                </div>
                <Progress size="sm" value={c.sharePct} label={c.label} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-xs">
              {(["confirmed", "informed", "estimated"] as const).map((p) => (
                <Badge key={p} tone={PROV_TONE[p]}>
                  {PROVENANCE_LABEL[p]}: <Money cents={s.byProvenance[p]} tone="none" />
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolução" description="Um registro por mês, atualizado quando você visita esta página ou o painel." />
          <CardBody>
            {nw.history.length < 2 ? (
              <p className="text-sm text-muted">A evolução aparece a partir do segundo mês de uso.</p>
            ) : (
              <SingleLineChart data={nw.history.map((h) => ({ mes: formatMonthShort(h.month), liquido: h.netWorthCents }))} xKey="mes" yKey="liquido" label="Patrimônio líquido" xLabel="Mês" />
            )}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Itens do patrimônio" />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium">Categoria</th>
                <th className="py-2 font-medium">Procedência</th>
                <th className="py-2 text-right font-medium">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {nw.items.map((i) => {
                const asset = nw.assets.find((a) => `asset:${a.id}` === i.id);
                const debt = nw.debts.find((d) => `debt:${d.id}` === i.id);
                return (
                  <tr key={i.id}>
                    <td className="py-2">
                      {i.name}
                      {asset ? <span className="block text-xs text-muted">valor de {formatDateBR(asset.valuedAt)}</span> : debt ? <span className="block text-xs text-muted">saldo de {formatDateBR(debt.valuedAt)}</span> : null}
                    </td>
                    <td className="py-2 text-muted">{i.side === "asset" ? ASSET_CATEGORY_LABEL[i.category as AssetCategory] : LIABILITY_CATEGORY_LABEL[i.category as LiabilityCategory]}</td>
                    <td className="py-2">
                      <Badge tone={PROV_TONE[i.provenance]}>{PROVENANCE_LABEL[i.provenance]}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Money cents={i.side === "asset" ? i.valueCents : -i.valueCents} />
                    </td>
                    <td className="py-2 text-right">
                      {asset ? (
                        <span className="inline-flex gap-1">
                          <Dialog trigger={<Pencil className="size-3.5" />} title="Atualizar valor" variant="ghost" size="sm">
                            <AssetForm action={saveAssetAction} today={ctx.today} defaults={{ id: asset.id, name: asset.name, category: asset.category, value: centsToInput(asset.valueCents), provenance: asset.provenance, valuedAt: ctx.today, liquid: asset.liquid, notes: asset.notes }} />
                          </Dialog>
                          <InlineAction action={archiveAssetAction} hidden={{ id: asset.id }} confirm="Remover este bem do patrimônio?">
                            Remover
                          </InlineAction>
                        </span>
                      ) : debt ? (
                        <span className="inline-flex gap-1">
                          <Dialog trigger={<Pencil className="size-3.5" />} title="Atualizar dívida" variant="ghost" size="sm">
                            <DebtForm
                              action={saveDebtAction}
                              today={ctx.today}
                              defaults={{ id: debt.id, name: debt.name, category: debt.category, outstanding: centsToInput(debt.outstandingCents), monthlyPayment: centsToInput(debt.monthlyPaymentCents), interestRateMonthly: debt.interestRateMonthlyBps ? String(debt.interestRateMonthlyBps / 100).replace(".", ",") : "", remainingInstallments: debt.remainingInstallments?.toString() ?? "", provenance: debt.provenance, valuedAt: ctx.today, notes: debt.notes }}
                            />
                          </Dialog>
                          <InlineAction action={archiveDebtAction} hidden={{ id: debt.id }} confirm="Remover esta dívida (quitada)?">
                            Quitada
                          </InlineAction>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">vem dos lançamentos</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {nw.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-muted">
                    Cadastre contas, bens e dívidas para ver seu patrimônio.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {liabilities.length ? <p className="mt-3 text-xs text-muted">Faturas em aberto (incluindo parcelas futuras) entram como passivo confirmado.</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
