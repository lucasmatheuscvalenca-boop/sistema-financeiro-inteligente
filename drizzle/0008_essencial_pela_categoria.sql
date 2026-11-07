-- "Essencial" vem da categoria (Moradia, Mercado, Saúde...) e alimenta a reserva de emergência e o
-- planejamento. Lançamentos importados ou sincronizados ficaram sem a marcação, e trocar a
-- categoria mantinha a da categoria antiga. Corrige despesas e estornos que têm categoria:
-- preenche o que está vazio e marca como essencial o que está numa categoria essencial. Um
-- "essencial" já marcado não é desfeito, porque pode ter sido escolhido à mão no formulário.
UPDATE "transactions" AS t
SET "essential" = c."essential"
FROM "categories" AS c
WHERE c."id" = t."category_id"
  AND t."kind" IN ('expense', 'refund')
  AND (t."essential" IS NULL OR (t."essential" = false AND c."essential" = true));
