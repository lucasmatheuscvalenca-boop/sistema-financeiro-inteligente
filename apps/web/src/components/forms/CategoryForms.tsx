"use client";

import { Archive, Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { initialActionState } from "@/lib/action-state";
import { archiveCategoryAction, createCategoryAction, renameCategoryAction } from "@/server/actions/categories";
import { CategoryIcon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Field, inputClass } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton, buttonStyles } from "@/components/ui/SubmitButton";
import type { CategoryDTO } from "@/server/dal/categories";

export function CreateCategoryForm({ workspaceId }: { workspaceId: string }) {
  const [state, action] = useActionState(createCategoryAction, initialActionState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" key={state.ok ? state.message : "form"}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Field label="Nova categoria" name="name" required maxLength={60} placeholder="Ex.: Viagens" />
      <Field label="Descrição (opcional)" name="description" maxLength={300} />
      <SubmitButton pendingLabel="Criando…">Criar</SubmitButton>
      <Notice state={state} className="sm:col-span-3" />
    </form>
  );
}

export function CategoryCard({
  workspaceId,
  category,
  canManage,
}: {
  workspaceId: string;
  category: CategoryDTO;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction] = useActionState(async (prev: typeof initialActionState, fd: FormData) => {
    const result = await renameCategoryAction(prev, fd);
    if (result.ok) setEditing(false);
    return result;
  }, initialActionState);
  const [archiveState, archiveAction] = useActionState(archiveCategoryAction, initialActionState);

  return (
    <li className="pixel-frame flex flex-col gap-3 bg-navy-850 p-4" data-testid="category-card">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center border-2 border-[var(--accent)]/40 bg-navy-900">
          <CategoryIcon name={category.icon} className="size-5 text-[var(--accent)]" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form action={renameAction} className="flex gap-2">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <input
                name="name"
                defaultValue={category.name}
                aria-label="Novo nome da categoria"
                maxLength={60}
                required
                autoFocus
                className={inputClass}
              />
              <SubmitButton variant="secondary">Ok</SubmitButton>
            </form>
          ) : (
            <h3 className="truncate font-semibold" data-testid="category-name">
              {category.name}
            </h3>
          )}
          {category.description && <p className="mt-1 text-sm text-muted">{category.description}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {category.isSeed ? <Badge>inicial</Badge> : <Badge tone="signal">criada por você</Badge>}
        {canManage && !editing && (
          <div className="flex gap-1">
            <button type="button" className={buttonStyles.ghost} onClick={() => setEditing(true)} aria-label={`Renomear ${category.name}`}>
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <form
              action={archiveAction}
              onSubmit={(e) => {
                if (!window.confirm(`Arquivar a categoria “${category.name}”? Ela some da lista, mas o histórico fica guardado.`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <button type="submit" className={buttonStyles.ghost} aria-label={`Arquivar ${category.name}`}>
                <Archive className="size-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      </div>
      <Notice state={renameState.ok ? initialActionState : renameState} />
      <Notice state={archiveState.ok ? initialActionState : archiveState} />
    </li>
  );
}
