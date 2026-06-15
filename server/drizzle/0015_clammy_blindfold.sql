ALTER TABLE "debts" ADD COLUMN "cutoff_date" date;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "installments" integer;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "installment_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "monthly_interest_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "late_interest_rate" numeric(5, 2);