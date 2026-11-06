-- O Banqueiro: um único consultor para todas as contas. Os seis personagens anteriores continuam na
-- tabela só para preservar o histórico de escolhas e as mensagens antigas do assistente.
ALTER TABLE "mascots" DROP CONSTRAINT IF EXISTS "mascots_official_ids";--> statement-breakpoint
ALTER TABLE "mascots" ADD CONSTRAINT "mascots_official_ids" CHECK ("mascots"."id" in ('banqueiro','lince','capivara','coruja','polvo','raposa','guardiao'));--> statement-breakpoint
INSERT INTO "mascots" ("id", "name", "title", "catchphrase", "sort_order") VALUES
  ('banqueiro', 'O Banqueiro', 'Seu consultor financeiro', 'Decisões claras hoje, liberdade amanhã.', 0)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "user_preferences" SET "mascot_id" = 'banqueiro' WHERE "mascot_id" IS NOT NULL AND "mascot_id" <> 'banqueiro';--> statement-breakpoint
INSERT INTO "mascot_selections" ("user_id", "mascot_id", "selected_at")
SELECT p."user_id", 'banqueiro', now() FROM "user_preferences" p
WHERE p."mascot_id" = 'banqueiro'
  AND NOT EXISTS (SELECT 1 FROM "mascot_selections" ms WHERE ms."user_id" = p."user_id" AND ms."mascot_id" = 'banqueiro');
