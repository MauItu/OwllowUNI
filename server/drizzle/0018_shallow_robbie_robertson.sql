ALTER TABLE "accounts" ADD COLUMN "management_fee_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "management_fee_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "management_fee_rule_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_management_fee_rule_id_recurring_rules_id_fk" FOREIGN KEY ("management_fee_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
