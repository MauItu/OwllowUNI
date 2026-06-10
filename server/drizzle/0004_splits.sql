CREATE TABLE IF NOT EXISTS "split_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"description" varchar(255) NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"paid_by_member_id" integer NOT NULL,
	"date" date NOT NULL,
	"transaction_id" integer,
	"category_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "split_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"icon" varchar(50) DEFAULT 'users' NOT NULL,
	"color" varchar(7) DEFAULT '#3A60A1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "split_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_me" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "split_members_group_id_name_unique" UNIQUE("group_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "split_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"is_settled" boolean DEFAULT false NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "split_shares_expense_id_member_id_unique" UNIQUE("expense_id","member_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_paid_by_member_id_split_members_id_fk" FOREIGN KEY ("paid_by_member_id") REFERENCES "public"."split_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_expenses" ADD CONSTRAINT "split_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_members" ADD CONSTRAINT "split_members_group_id_split_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."split_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_expense_id_split_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."split_expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_shares" ADD CONSTRAINT "split_shares_member_id_split_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."split_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
