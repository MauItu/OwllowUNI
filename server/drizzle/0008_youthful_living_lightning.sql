CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
INSERT INTO "users" ("email", "password_hash", "name", "is_admin") VALUES ('mauiturriza@gmail.com', 'migration-placeholder-rehashed-by-seed', 'Mauricio', true) ON CONFLICT ("email") DO NOTHING;--> statement-breakpoint
ALTER TABLE "exchange_rates" DROP CONSTRAINT IF EXISTS "exchange_rates_base_currency_target_currency_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_name_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "accounts" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "categories" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "debts" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "exchange_rates" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "exchange_rates" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "savings_goals" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "savings_goals" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "split_groups" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "split_groups" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "split_groups" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "tags" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "templates" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "transactions" SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'mauiturriza@gmail.com') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "split_groups" ADD CONSTRAINT "split_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_base_currency_target_currency_unique" UNIQUE("user_id","base_currency","target_currency");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_name_unique" UNIQUE("user_id","name");
