CREATE TABLE IF NOT EXISTS "split_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"from_member_id" integer NOT NULL,
	"to_member_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"date" date NOT NULL,
	"account_id" integer,
	"transaction_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD COLUMN "account_id" integer;--> statement-breakpoint
ALTER TABLE "split_expenses" ADD COLUMN "account_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_from_member_id_split_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."split_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_to_member_id_split_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."split_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_settlements" ADD CONSTRAINT "split_settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
