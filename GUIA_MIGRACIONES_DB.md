# GUIA_MIGRACIONES_DB.md — Cómo modificar el schema SIN perder datos existentes

> Guía paso a paso para cualquier cambio en la base de datos (PostgreSQL en NeonDB, Drizzle ORM).
> La DB ya está migrada, seedeada y **tiene datos reales del usuario**. Borrarlos NO es aceptable.
> Aplica a las tareas de `PLAN_NUEVAS_FUNCIONES.md` y a cualquier cambio futuro.

---

## Qué cambios necesita cada tarea del plan

| Tarea | ¿Migración? | Cambio |
|---|---|---|
| 1. Splits con cuentas | **Sí** | `split_expenses` + columna `account_id` (nullable); tabla nueva `split_settlements` |
| 2. Más íconos/colores | No | Solo listas en el mobile (`icon` varchar(50) y `color` varchar(7) ya aceptan cualquier valor) |
| 3. Abonos de deudas con cuenta | **Sí** | `debt_payments` + columna `account_id` (nullable) |
| 4. Safe areas / responsive | No | Solo mobile |
| 5. Hora en gastos/ingresos | **No** | `transactions.time` (TIME NOT NULL) **ya existe** desde la migración inicial — no tocar |

Regla de oro: **todos los cambios deben ser aditivos** — `CREATE TABLE` y `ALTER TABLE ... ADD COLUMN`
con la columna **nullable o con DEFAULT**. Nunca `DROP`, nunca renombrar, nunca cambiar tipos de columnas
con datos, nunca agregar columnas `NOT NULL` sin default a tablas con filas (falla la migración).

---

## Procedimiento paso a paso

### Paso 0 — Backup (siempre, antes de tocar nada)

Opción A (recomendada, Neon lo hace gratis): crear un **branch** de la DB en la consola de Neon
(https://console.neon.tech → proyecto → Branches → "Create branch"). Es una copia instantánea;
si algo sale mal, se restaura o se apunta el `DATABASE_URL` al branch.

Opción B (local): dump lógico con `pg_dump` usando la connection string del `.env` raíz:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom -f backup_$(date +%Y%m%d_%H%M).dump
```

Anotar además los conteos para verificar después:

```sql
SELECT 'transactions' t, count(*) FROM transactions
UNION ALL SELECT 'accounts', count(*) FROM accounts
UNION ALL SELECT 'debts', count(*) FROM debts
UNION ALL SELECT 'debt_payments', count(*) FROM debt_payments
UNION ALL SELECT 'split_expenses', count(*) FROM split_expenses
UNION ALL SELECT 'split_shares', count(*) FROM split_shares
UNION ALL SELECT 'savings_goals', count(*) FROM savings_goals;
```

### Paso 1 — Editar el schema

Modificar **solo** `server/src/db/schema.ts`. Ejemplo para las tareas del plan:

```ts
// debt_payments: agregar (nullable → no afecta filas existentes)
accountId: integer('account_id').references(() => accounts.id),

// split_expenses: agregar
accountId: integer('account_id').references(() => accounts.id),

// tabla nueva (no afecta nada existente)
export const splitSettlements = pgTable('split_settlements', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => splitGroups.id, { onDelete: 'cascade' }).notNull(),
  fromMemberId: integer('from_member_id').references(() => splitMembers.id).notNull(),
  toMemberId: integer('to_member_id').references(() => splitMembers.id).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  date: date('date').notNull(),
  accountId: integer('account_id').references(() => accounts.id),
  transactionId: integer('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at').defaultNow(),
});
```

> En tablas nuevas sí se puede usar `NOT NULL` libremente (no tienen filas).
> En tablas existentes: columna nueva = nullable, o `NOT NULL` **solo** con `.default(...)`.

### Paso 2 — Generar la migración (nunca escribir el SQL a mano, nunca db:push)

```bash
cd server
pnpm db:generate
```

Esto crea un archivo nuevo en `server/drizzle/NNNN_*.sql`. **NO usar `pnpm db:push`**: `drizzle-kit push`
sincroniza el schema directo contra la DB y puede decidir DROPs/recreaciones sin dejar rastro. Solo
`generate` + `migrate`.

### Paso 3 — REVISAR el SQL generado (el paso que evita el desastre)

Abrir el `.sql` nuevo y verificar línea por línea que **solo** contiene:

- `CREATE TABLE "split_settlements" (...)`
- `ALTER TABLE "debt_payments" ADD COLUMN "account_id" integer;`
- `ALTER TABLE "split_expenses" ADD COLUMN "account_id" integer;`
- Los `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` correspondientes.

**Señales de alarma — si aparece alguna, DETENERSE y no migrar:**

- `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`
- `ALTER COLUMN ... SET NOT NULL` sobre una tabla con datos (sin haber rellenado antes)
- `ALTER COLUMN ... TYPE` (cambio de tipo)
- Recreación de una tabla existente (`CREATE TABLE` de una tabla que ya existe)

Si drizzle-kit generó algo destructivo, casi siempre es porque el schema.ts quedó desincronizado de las
migraciones previas (¿se editó algo más sin querer? `git diff server/src/db/schema.ts` debe mostrar SOLO
las adiciones). Corregir el schema, borrar el `.sql` recién generado **junto con su entrada en
`server/drizzle/meta/_journal.json`** (drizzle-kit lo maneja con `pnpm drizzle-kit drop` si está
disponible) y regenerar.

### Paso 4 — Aplicar

```bash
pnpm db:migrate
```

**NO correr `pnpm db:seed`** (el seed es solo para una DB vacía; re-ejecutarlo duplicaría categorías).

### Paso 5 — Verificar que no se perdió nada

1. Repetir la query de conteos del Paso 0 → los números deben ser idénticos.
2. Verificar la estructura nueva:
   ```sql
   SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name IN ('debt_payments','split_expenses','split_settlements')
   ORDER BY table_name, ordinal_position;
   ```
3. Las columnas nuevas en filas viejas deben estar en `NULL`:
   `SELECT count(*) FROM debt_payments WHERE account_id IS NOT NULL;` → 0 (antes de usar la feature).
4. Levantar el backend (`pnpm dev`) y probar un `GET /api/debts` y `GET /api/splits` → 200 con los datos de siempre.
5. Smoke test del mobile contra la API.

### Paso 6 — Commit

Commitear **juntos**: `schema.ts` + el `.sql` generado + `drizzle/meta/*` actualizado. Las migraciones
son historia inmutable: una vez aplicada en Neon, **jamás editar ni borrar** un `.sql` ya migrado;
cualquier corrección es una migración nueva.

---

## Gotchas conocidas de este proyecto

- **`drizzle.__drizzle_migrations` huérfano**: si alguna vez se vació la DB a mano, ese schema interno
  puede sobrevivir y `pnpm db:migrate` dirá "✅ aplicadas" sin crear nada. Si una migración "se aplica"
  pero la tabla/columna no existe, revisar:
  `SELECT * FROM drizzle.__drizzle_migrations;` — si lista migraciones que la DB realmente no refleja,
  hay que reconciliar (en una DB CON datos: aplicar a mano el SQL faltante y registrar la fila, NUNCA
  borrar las tablas).
- **Neon HTTP no soporta transacciones interactivas**: irrelevante para `db:migrate` (drizzle lo maneja),
  pero el código de rutas debe usar `db.batch([...])` para atomicidad.
- El `.env` con `DATABASE_URL` está en la **raíz** del repo; `drizzle.config.ts` y `connection.ts` lo leen
  desde ahí (`../.env`). Correr los comandos desde `server/`.
- Si una columna nueva debe terminar siendo `NOT NULL` en el futuro: 1) agregarla nullable, 2) backfill
  (`UPDATE ... SET col = ... WHERE col IS NULL`), 3) migración aparte con `SET NOT NULL`. Nunca en un paso.

---

## Checklist resumido

```text
[ ] Backup (branch de Neon o pg_dump) + conteos anotados
[ ] schema.ts: solo cambios aditivos (columnas nullable / tablas nuevas)
[ ] pnpm db:generate  (NUNCA db:push)
[ ] Revisar el .sql: cero DROP / cero ALTER TYPE / cero SET NOT NULL sobre tablas con datos
[ ] pnpm db:migrate   (NO re-seedear)
[ ] Conteos idénticos + columnas nuevas en NULL + API responde con los datos de siempre
[ ] Commit de schema.ts + drizzle/*.sql + drizzle/meta juntos
```
