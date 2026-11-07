import { FIRST_BUSINESS_SUGGESTION } from "@myoffice/core";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateBusinessForm } from "@/components/forms/WorkspaceForms";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { requireAuth } from "@/server/auth";
import { listMyWorkspaces } from "@/server/dal/workspaces";

export const metadata: Metadata = { title: "Boas-vindas" };

export default async function WelcomePage() {
  const auth = await requireAuth();
  const workspaces = await listMyWorkspaces(auth);
  const personal = workspaces.find((w) => w.kind === "personal");
  const businesses = workspaces.filter((w) => w.kind === "business");

  return (
    <PageBody>
      <PageHeader
        eyebrow={<Badge tone="signal">Primeiros passos</Badge>}
        title="Seu escritório está pronto"
        description="O universo pessoal já foi criado com 8 categorias. Agora crie o universo da sua empresa — ele fica isolado do pessoal."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="pixel-frame space-y-3 bg-navy-850 p-6" data-universe="personal">
          <Badge tone="personal">Pessoal · criado</Badge>
          <h2 className="text-lg font-semibold">{personal?.name ?? "Pessoal"}</h2>
          <p className="text-sm text-muted">
            Projetos pessoais, planejamento de vida, finanças pessoais, estudos, pesquisas, ideias, produtividade e
            projetos experimentais.
          </p>
          {personal && (
            <Link href={`/w/${personal.id}`} className="inline-block text-sm font-medium text-personal hover:underline">
              Abrir universo pessoal
            </Link>
          )}
        </section>
        <section className="pixel-frame space-y-4 bg-navy-850 p-6" data-universe="business">
          <Badge tone="business">Empresarial</Badge>
          {businesses.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">Empresas criadas</h2>
              <ul className="space-y-1 text-sm">
                {businesses.map((b) => (
                  <li key={b.id}>
                    <Link href={`/w/${b.id}`} className="text-business hover:underline">
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted">Quer adicionar outra?</p>
              <CreateBusinessForm submitLabel="Adicionar empresa" />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Primeira empresa</h2>
              <p className="text-sm text-muted">
                Estratégia, comercial, marketing, gestão, operações, inteligência de negócios, pessoas e projetos.
              </p>
              <CreateBusinessForm suggestion={FIRST_BUSINESS_SUGGESTION} />
            </>
          )}
        </section>
      </div>
      <p className="text-sm">
        <Link href="/inicio" className="text-muted underline-offset-4 hover:text-ink hover:underline">
          Fazer isso depois e ir para o início
        </Link>
      </p>
    </PageBody>
  );
}
