# Wallet Clone — App de Gestión de Gastos

Clon de "Wallet by BudgetBakers". Monorepo con backend (Express + Drizzle + Neon) y app móvil (Expo / React Native). Todo en español, moneda default COP.

> 📄 Contexto completo del proyecto en [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md).

## Requisitos
- Node 20+
- **pnpm** (`npm i -g pnpm`)
- Una base de datos PostgreSQL en Neon. Pon la connection string en `.env` (raíz):
  ```
  DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require
  ```
- `JWT_SECRET` de al menos 32 caracteres en `.env`. Opcionales: `GMAIL_USER`/`GMAIL_APP_PASSWORD`
  para recuperación de contraseña y `ALERT_WEBHOOK_URL` para alertas operativas.

## Backend
```bash
cd server
pnpm install
pnpm db:generate   # solo después de cambiar el schema
pnpm db:migrate    # aplica migraciones versionadas en Neon
pnpm db:seed       # solo para bootstrap/admin; no lo corras como parte normal del deploy
pnpm dev           # API en http://localhost:3000
```

## Mobile
```bash
cd mobile
pnpm install
pnpm start         # abre Expo
```
Antes de probar en un dispositivo, edita `API_BASE_URL` en `mobile/src/api/client.ts`
con la IP de tu PC en la LAN (no uses `localhost`), o exporta `EXPO_PUBLIC_API_URL`.

### Compilar APK
```bash
cd mobile
pnpm build:apk     # eas build -p android --profile preview
```
(Requiere `eas login` y `eas init` para configurar `projectId` en `app.json`.)

## Verificación
```bash
cd server && pnpm typecheck && pnpm test
cd mobile && pnpm typecheck
```

CI corre estos checks en GitHub Actions para PRs y pushes a `main`.
