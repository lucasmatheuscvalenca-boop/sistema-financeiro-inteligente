import { findModule } from "@myoffice/core";
import type { Metadata } from "next";
import { PlannedModule } from "@/components/shell/PlannedModule";
import { Badge } from "@/components/ui/Badge";
import { requireAuth } from "@/server/auth";

export const metadata: Metadata = { title: findModule("aprovacoes")?.label };

export default async function Page() {
  await requireAuth();
  return <PlannedModule moduleKey="aprovacoes" eyebrow={<Badge tone="signal">Visão do dono</Badge>} />;
}
