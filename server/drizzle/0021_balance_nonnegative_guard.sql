-- Cierre del TOCTOU de saldos (hallazgo de seguridad #2): a nivel de aplicación,
-- el chequeo de fondos era leer-luego-escribir (SELECT current_balance → UPDATE
-- current_balance + delta) SIN guard atómico, así que dos débitos concurrentes del
-- mismo usuario podían pasar ambos y dejar el saldo negativo / exceder el cupo.
--
-- Esta CHECK lo vuelve imposible a nivel de la base: una cuenta SIN sobregiro nunca
-- puede quedar con saldo negativo (vale para débito y para tarjetas, donde
-- current_balance ES el crédito disponible). Las cuentas con allow_overdraft = true
-- siguen pudiendo ir a negativo (comportamiento intencional). Si un UPDATE
-- concurrente intenta dejarlo negativo, Postgres lo rechaza y la saga ya existente
-- compensa y revierte.
--
-- Se agrega NOT VALID: la restricción se aplica a TODO INSERT/UPDATE futuro (que es
-- lo que cierra la carrera) pero NO valida las filas existentes, de modo que la
-- migración no falla si algún saldo histórico ya quedó negativo por el bug anterior.
-- Para validar el histórico (tras corregir esos saldos) correr luego:
--   ALTER TABLE "accounts" VALIDATE CONSTRAINT "accounts_balance_nonnegative";
DO $$ BEGIN
 ALTER TABLE "accounts"
   ADD CONSTRAINT "accounts_balance_nonnegative"
   CHECK ("allow_overdraft" = true OR "current_balance" >= 0) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
