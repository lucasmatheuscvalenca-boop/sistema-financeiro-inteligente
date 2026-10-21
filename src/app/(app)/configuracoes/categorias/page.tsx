import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { updateCategoryAction } from "../../_actions/account";
import { archiveCategoryAction, createCategoryAction } from "../../_actions/finance";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Checkbox, Field, InlineAction, Input, Select, SubmitButton } from "@/components/ui/form";
import { requireOnboarded } from "@/server/auth/current";
import { listCategories, type CategoryRow } from "@/server/services/categories";

export const metadata: Metadata = { title: "Categorias" };

function Row({ c, child = false }: { c: CategoryRow; child?: boolean }) {
  return (
    <li className={child ? "ml-6 flex items-center justify-between gap-2 border-l border-line py-1.5 pl-3" : "flex items-center justify-between gap-2 py-1.5"}>
      <span className="flex items-center gap-2 text-sm">
        <span className={child ? "" : "font-medium"}>{c.name}</span>
        {c.essential ? <Badge tone="info">essencial</Badge> : null}
      </span>
      <span className="flex gap-1">
        <Dialog trigger={<Pencil className="size-3.5" aria-label={`Editar ${c.name}`} />} title="Editar categoria" variant="ghost" size="sm">
          <ActionForm action={updateCategoryAction}>
            <input type="hidden" name="id" value={c.id} />
            <Field label="Nome" name="name">
              <Input name="name" defaultValue={c.name} required maxLength={60} />
            </Field>
            {c.kind === "expense" ? <Checkbox name="essential" defaultChecked={c.essential} label="Despesa essencial (entra no cálculo da reserva e da margem de segurança)" /> : null}
            <SubmitButton variant="petrol">Salvar</SubmitButton>
          </ActionForm>
        </Dialog>
        <InlineAction action={archiveCategoryAction} hidden={{ id: c.id }} confirm={`Arquivar “${c.name}”? Lançamentos antigos continuam com esta categoria.`}>
          Arquivar
        </InlineAction>
      </span>
    </li>
  );
}

function Tree({ items }: { items: CategoryRow[] }) {
  const roots = items.filter((c) => !c.parentId);
  return (
    <ul className="divide-y divide-line">
      {roots.map((r) => (
        <li key={r.id}>
          <ul>
            <Row c={r} />
            {items
              .filter((c) => c.parentId === r.id)
              .map((c) => (
                <Row key={c.id} c={c} child />
              ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default async function CategoriesPage() {
  const { ctx } = await requireOnboarded();
  const all = await listCategories(ctx);
  const expense = all.filter((c) => c.kind === "expense");
  const income = all.filter((c) => c.kind === "income");
  const roots = all.filter((c) => !c.parentId);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
      <Card>
        <CardHeader title="Despesas" description={`${expense.length} categorias`} />
        <CardBody>
          <Tree items={expense} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Receitas" description={`${income.length} categorias`} />
        <CardBody>
          <Tree items={income} />
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Nova categoria" icon={<Plus className="size-4" />} />
        <CardBody>
          <ActionForm action={createCategoryAction} resetOnSuccess>
            <Field label="Nome" name="name">
              <Input name="name" required maxLength={60} />
            </Field>
            <Field label="Tipo" name="kind">
              <Select name="kind" defaultValue="expense">
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </Select>
            </Field>
            <Field label="Dentro de (opcional)" name="parentId" hint="Precisa ser do mesmo tipo.">
              <Select name="parentId" defaultValue="">
                <option value="">— categoria principal —</option>
                {roots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.kind === "expense" ? "Despesa" : "Receita"} › {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox name="essential" label="Despesa essencial" />
            <SubmitButton variant="petrol">Criar</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
