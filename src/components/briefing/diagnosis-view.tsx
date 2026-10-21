import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Diagnosis, IndicatorStatus } from "@/server/services/briefing";
import { cn } from "@/lib/cn";

const STATUS: Record<IndicatorStatus, { icon: React.ReactNode; className: string; label: string }> = {
  good: { icon: <CircleCheck className="size-5" />, className: "text-positive", label: "Saudável" },
  attention: { icon: <TriangleAlert className="size-5" />, className: "text-warning", label: "Atenção" },
  critical: { icon: <CircleAlert className="size-5" />, className: "text-negative", label: "Crítico" },
  unknown: { icon: <CircleHelp className="size-5" />, className: "text-muted", label: "Sem dados" },
};

export function DiagnosisView({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="Indicadores" description="Referências gerais, não regras. Baseados apenas nos valores declarados." />
        <CardBody className="space-y-3">
          {diagnosis.indicators.map((i) => (
            <div key={i.key} className="flex gap-3 rounded-2xl border border-line p-3">
              <span className={cn("mt-0.5", STATUS[i.status].className)} aria-label={STATUS[i.status].label}>
                {STATUS[i.status].icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {i.label}: <span className="tabular-nums">{i.value}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted">{i.explanation}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Próximos passos" />
          <CardBody>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {diagnosis.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </CardBody>
        </Card>
        {diagnosis.missing.length ? (
          <Card>
            <CardHeader title="Informações que ainda faltam" description="Sem elas, algumas análises ficam condicionais." />
            <CardBody>
              <ul className="space-y-1.5 text-sm text-muted">
                {diagnosis.missing.map((m) => (
                  <li key={m}>• {m}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
        <p className="text-xs text-muted">{diagnosis.assumptions.join(" ")}</p>
      </div>
    </div>
  );
}
