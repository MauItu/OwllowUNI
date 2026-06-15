ALTER TABLE "debts" ADD COLUMN "initial_transaction_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debts" ADD CONSTRAINT "debts_initial_transaction_id_transactions_id_fk" FOREIGN KEY ("initial_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
