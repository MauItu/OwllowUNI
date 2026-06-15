ALTER TABLE "savings_contributions" ADD COLUMN "account_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "savings_contributions_account_id_idx" ON "savings_contributions" USING btree ("account_id");