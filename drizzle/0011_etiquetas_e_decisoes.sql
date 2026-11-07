CREATE TABLE "spend_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"level" text NOT NULL,
	"max_safe_cents" bigint,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_decisions_decision" CHECK ("spend_decisions"."decision" in ('bought','waited','gave_up')),
	CONSTRAINT "spend_decisions_amount" CHECK ("spend_decisions"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "split_from_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_decisions" ADD CONSTRAINT "spend_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spend_decisions_user_idx" ON "spend_decisions" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_split_from_id_transactions_id_fk" FOREIGN KEY ("split_from_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_tags_idx" ON "transactions" USING gin ("tags");