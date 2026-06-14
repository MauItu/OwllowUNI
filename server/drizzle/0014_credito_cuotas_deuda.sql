ALTER TABLE "transactions" ADD COLUMN "installments" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "current_installment" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "debt_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_debt_id_idx" ON "transactions" USING btree ("debt_id");--> statement-breakpoint
-- Nuevo modelo mental de tarjetas: current_balance pasa de "deuda (negativa)" a
-- "crédito disponible (positivo)". Conversión idempotente solo de las tarjetas que
-- aún están en el modelo viejo (saldo <= 0, que es lo que dejaba el modelo anterior).
UPDATE "accounts"
SET "current_balance" = "credit_limit" + "current_balance",
    "initial_balance" = "credit_limit" + "initial_balance"
WHERE "type" = 'credit_card'
  AND "credit_limit" IS NOT NULL
  AND "current_balance" <= 0
  AND "initial_balance" <= 0;