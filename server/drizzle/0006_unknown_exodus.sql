CREATE TABLE IF NOT EXISTS "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"target_currency" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_base_currency_target_currency_unique" UNIQUE("base_currency","target_currency")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "to_amount" numeric(15, 2);