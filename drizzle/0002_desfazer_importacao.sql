ALTER TABLE "import_batches" ADD COLUMN "previous_initial_balance_cents" bigint;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "previous_initial_balance_date" date;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "undone_at" timestamp with time zone;