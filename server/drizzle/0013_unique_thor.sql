CREATE TABLE IF NOT EXISTS "credit_card_statements" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payment_due_date" date NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"paid_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"debt_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_card_statements_account_id_period_end_unique" UNIQUE("account_id","period_end")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_limit" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "billing_cycle_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "payment_due_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "allow_overdraft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_card_statements_user_account_paid_idx" ON "credit_card_statements" USING btree ("user_id","account_id","is_paid");