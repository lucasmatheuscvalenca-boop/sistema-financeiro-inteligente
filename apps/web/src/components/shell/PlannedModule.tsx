import { findModule } from "@myoffice/core";
import { Hammer } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { PageBody, PageHeader } from "./PageHeader";

/**
 * Página de um módulo que pertence a uma fase futura. Diz isso com clareza e mostra apenas fatos reais
 * (ex.: contagens do banco) — nunca dados de exemplo.
 */
export function PlannedModule({ moduleKey, facts, eyebrow }: { moduleKey: string; facts?: ReactNode; eyebrow?: ReactNode }) {
  const mod = findModule(moduleKey);
  if (!mod) return null;
  return (
    <PageBody>
      <PageHeader
        eyebrow={
          <>
            {eyebrow}
            <Badge tone="warn">Fase {mod.phase}</Badge>
          </>
        }
        title={mod.label}
        description={mod.summary}
      />
      <section className="pixel-frame flex flex-col gap-4 bg-navy-850 p-6 sm:flex-row sm:items-start" data-testid="planned-module">
        <Hammer className="size-8 shrink-0 text-warn" aria-hidden="true" />
        <div className="space-y-2">
          <h2 className="font-semibold">Este módulo ainda não foi construído</h2>
          <p className="text-sm text-muted">
            Ele entra na <strong className="text-ink">Fase {mod.phase}</strong> do roadmap. Até lá, esta tela não mostra
            dados de exemplo nem simula funcionamento.
          </p>
          {facts && <div className="pt-2 text-sm">{facts}</div>}
        </div>
      </section>
    </PageBody>
  );
}
