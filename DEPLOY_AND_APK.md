# DEPLOY_AND_APK.md — Deploy del backend (Render) + build del APK (EAS)

> Guía copy-paste con los valores **reales** de este repo. Hecha el 2026-06-13.
>
> **Valores reales detectados:**
> - Servicio Render: **`https://wallet-7v82.onrender.com`** (de `mobile/eas.json` → perfil `preview`).
> - API base que consume el móvil: **`https://wallet-7v82.onrender.com/api`**.
> - DB: **Neon PostgreSQL** (`DATABASE_URL` en el `.env` de la raíz). **Ya está migrada (0000→0009) y seedeada.**
> - Backend: `server/` — build `tsc` → `dist/`, arranque `node dist/index.js`. Package manager **pnpm**.
> - App móvil: Expo SDK 54, slug `wallet-clone`, owner `maurarch`, EAS projectId `d1a959a4-1885-4e2e-a90d-53838005629a`.

---

## ⚠️ DIAGNÓSTICO ACTUAL (actualizado 2026-07-04)

Producción **ya sirve el código con auth/multiusuario**. Verificado contra la URL real:

```bash
curl -s https://wallet-7v82.onrender.com/api/health     # → HTTP 200 { status: 'ok', ... }
curl -s https://wallet-7v82.onrender.com/api/accounts   # → HTTP 401 { error: 'No autorizado: falta el token' }
```

El diagnóstico anterior (2026-06-13: prod servía la versión vieja single-user desde `main`
mientras el código nuevo vivía en la rama `APK`) **quedó resuelto**: `main` contiene el código
con auth y Render lo despliega. El flujo sigue siendo **merge a `main` → auto-deploy**.

**Pendientes reales de deploy (auditoría 2026-07-04, ver `AUDITORIA_LANZAMIENTO_Y_PLAN.md`):**

- La `DATABASE_URL` del `.env` **local** es rechazada por Neon (`password authentication failed` —
  credenciales rotadas). Render conecta con sus propias env vars, pero **las migraciones se corren
  desde local**, así que hay que actualizar el `.env` con la connection string vigente del dashboard
  de Neon antes de poder migrar.
- Por lo anterior, **no está confirmado** que la migración `0021_balance_nonnegative_guard`
  (CHECK `accounts_balance_nonnegative`) esté aplicada en la DB de producción. Verificar con:
  `SELECT conname, convalidated FROM pg_constraint WHERE conname = 'accounts_balance_nonnegative';`
  y, si falta, correr `cd server && pnpm db:migrate`. La constraint nace `NOT VALID`; tras revisar
  que no haya saldos negativos históricos ilegítimos, correr
  `ALTER TABLE accounts VALIDATE CONSTRAINT accounts_balance_nonnegative;`.
- `GMAIL_USER`/`GMAIL_APP_PASSWORD` sin configurar en Render → la recuperación de contraseña
  sigue deshabilitada (los endpoints devuelven 503 por un bypass temporal en el código).

---

## 1) Deploy del backend actualizado a Render

### 1.1 Llevar la rama de trabajo a `main` (lo que Render despliega)

> Render hace auto-deploy al hacer push a `main`. Mergeá tu rama de trabajo → `main` y pusheá.
> (Ejemplo con una rama `mi-rama`; en su momento fue `APK`, hoy sería la rama de feature activa.)

```bash
cd /home/mauro/Documents/proyectos/wallet

# Asegurate de tener la rama al día en el remoto
git checkout mi-rama
git push origin mi-rama

# Merge a main
git checkout main
git pull origin main
git merge mi-rama        # debería ser fast-forward o un merge limpio
git push origin main     # ← esto dispara el auto-deploy en Render
```

> **Alternativa (sin tocar main):** en el dashboard de Render → tu servicio → **Settings → Build & Deploy →
> Branch**, cambialo a la rama que quieras desplegar y guardá. (Recomiendo el merge a `main`
> para no dejar `main` desincronizado.)

### 1.2 Configuración del servicio en Render (Web Service)

Si el servicio ya existe (lo está, responde en `wallet-7v82.onrender.com`), verificá que tenga **exactamente**
esta config. Si lo creás de cero, usá estos valores:

| Campo | Valor |
|---|---|
| **Environment** | Node |
| **Root Directory** | `server` |
| **Build Command** | `corepack enable && pnpm install --frozen-lockfile && pnpm run build` |
| **Start Command** | `pnpm start`  *(= `node dist/index.js`)* |
| **Branch** | `main` (o `APK` si elegiste la alternativa) |
| **Auto-Deploy** | Yes |

> Notas reales:
> - El `start` script es `node dist/index.js` y el `build` es `tsc` (ver `server/package.json`). El `tsc`
>   compila a `dist/`, por eso el Build Command **debe** incluir `pnpm run build`.
> - El server escucha en `process.env.PORT || 3000` (`server/src/index.ts:25`). **Render inyecta `PORT`
>   automáticamente** — *no* lo definas a mano.
> - `connection.ts` y `migrate.ts` hacen `dotenv.config()` sobre `../.env` y `./.env`; en Render esos archivos
>   no existen, así que dotenv **no pisa** las env vars del dashboard. Por eso basta con setearlas en Render.

### 1.3 Variables de entorno en Render

En **Settings → Environment** del servicio, configurá:

| Variable | Valor | Obligatoria | Notas |
|---|---|---|---|
| `DATABASE_URL` | *(secreto — ver abajo)* | ✅ Sí | Connection string de Neon. **Está en el `.env` de la raíz del repo.** Copiala desde ahí. El server no arranca sin ella. |
| `JWT_SECRET` | *(secreto — poné uno fuerte)* | ✅ Sí | El server **no arranca** sin esto. En el repo el `.env` trae el default de dev `wallet-clone-secret-change-in-production`; **en Render poné un valor aleatorio fuerte** (ver comando abajo). |
| `GMAIL_USER` | *(secreto — ver abajo)* | ⚠️ Para recuperar contraseña | Dirección de Gmail que **envía** el email con el código de recuperación (también es el remitente `from`). Va de la mano con `GMAIL_APP_PASSWORD`. **Sin ambas la API arranca igual**, pero `forgot-password` responde 503. El resto de la app funciona normal. |
| `GMAIL_APP_PASSWORD` | *(secreto — ver abajo)* | ⚠️ Para recuperar contraseña | **Contraseña de aplicación** de 16 caracteres generada en la cuenta de Google (NO la contraseña normal; requiere verificación en 2 pasos). Va de la mano con `GMAIL_USER`. |
| `CORS_ORIGINS` | *(no setear)* | ❌ No | Sin esta var, CORS permite cualquier origen. **El APK nativo no envía header `Origin`, así que el móvil funciona igual.** Solo definila (lista separada por comas) si algún día sirvís un frontend web. |
| `PORT` | *(no setear)* | ❌ No | Lo inyecta Render. |
| `NODE_VERSION` | `22` | recomendado | El código usa `fetch` nativo de Node 22 (tasas de cambio). |

**`DATABASE_URL`** (no lo pego completo acá por ser secreto; está en `/home/mauro/Documents/proyectos/wallet/.env`):

```
postgresql://neondb_owner:****@ep-polished-salad-ajzloqar-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

> Tomá el valor exacto (con la password) del archivo `.env` de la raíz:
> ```bash
> grep DATABASE_URL /home/mauro/Documents/proyectos/wallet/.env
> ```

**Generar un `JWT_SECRET` fuerte para producción:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> ⚠️ Cambiar `JWT_SECRET` invalida cualquier token JWT ya emitido (expiran a 30 días). Como esta es la
> **primera** vez que prod corre con auth, no hay tokens válidos vivos → poné el secreto fuerte ahora sin
> problema. Si lo cambiás más adelante, el APP forzará re-login en todos los dispositivos.

**Obtener `GMAIL_USER` y `GMAIL_APP_PASSWORD` (recuperación de contraseña por email vía Gmail SMTP):**

El envío usa **Nodemailer** contra el SMTP de Gmail (`smtp.gmail.com:465`). Gmail no permite usar tu
contraseña normal desde apps: hay que generar una **contraseña de aplicación** (16 caracteres). Para eso
la cuenta de Google necesita **verificación en 2 pasos (2FA) activada**.

1. Activá la **verificación en 2 pasos** en tu cuenta de Google:
   [myaccount.google.com/security](https://myaccount.google.com/security) → "Verificación en 2 pasos".
2. Generá una **contraseña de aplicación** en
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords): poné un nombre
   (ej. "Wallet Clone") y Google te muestra una clave de **16 caracteres** (sin espacios). Se muestra
   una sola vez — copiala.
3. En Render → **Settings → Environment** configurá:
   - `GMAIL_USER` = tu dirección de Gmail (ej. `mauiturriza@gmail.com`).
   - `GMAIL_APP_PASSWORD` = la contraseña de aplicación de 16 caracteres (pegala sin espacios).
   (Para probar localmente, agregá ambas también al `.env` de la raíz del repo.)
4. **Remitente (`from`):** es directamente `GMAIL_USER`; el email sale desde tu propia dirección de Gmail.

> Sin `GMAIL_USER`/`GMAIL_APP_PASSWORD`, todo lo demás funciona: solo el flujo "¿Olvidaste tu contraseña?"
> devuelve un error claro (503). El login/registro normal no las necesita.

### 1.4 Migraciones en producción

**No hay migraciones pendientes.** La DB Neon ya tiene las 10 migraciones (`0000`→`0009`) aplicadas, `users`
poblada y los índices de la auditoría creados (lo verifiqué con `psql` contra la URL real).

Si en el futuro generás una migración nueva (`pnpm db:generate` en `server/`), aplicala a Neon con cualquiera
de estas dos vías:

- **Desde tu máquina** (la más simple, el `.env` de la raíz apunta a la DB real):
  ```bash
  cd /home/mauro/Documents/proyectos/wallet/server
  pnpm db:migrate          # = tsx src/db/migrate.ts ; idempotente, drizzle saltea las ya aplicadas
  ```
- **Desde Render** (Shell del servicio, requiere plan con Shell): `pnpm db:migrate`. Como `tsx` es devDependency
  y el Build Command instala todo, está disponible. Es idempotente.

> El usuario admin ya existe: **`mauiturriza@gmail.com` / `admin123`** (lo fija `pnpm db:seed`; cambialo desde
> la app en *Más → Perfil*). Si necesitaras re-seedear (recrea categorías default y rehashea la pass del admin):
> `cd server && pnpm db:seed`.

---

## 2) Verificar que producción responde bien

Tras el redeploy, corré estos curls (URL real). **El cambio clave es que `/api/auth/me` ya NO da 404 y
`/api/accounts` SIN token ahora da 401.**

```bash
# a) Liveness (debe responder siempre)
curl -s https://wallet-7v82.onrender.com/health
# → {"status":"ok"}

curl -s https://wallet-7v82.onrender.com/
# → {"name":"Wallet Clone API","status":"ok","version":"1.0.0"}

# b) Auth montado (antes daba 404). Sin body válido debe dar 400, NO 404:
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://wallet-7v82.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' -d '{}'
# → 400  (la ruta existe; faltan campos)

# c) Rutas de datos ahora EXIGEN token (antes daban 200 sin token):
curl -s -o /dev/null -w "%{http_code}\n" https://wallet-7v82.onrender.com/api/accounts
# → 401

# d) Login real → debe devolver { token, user }:
curl -s -X POST https://wallet-7v82.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mauiturriza@gmail.com","password":"admin123"}'
# → {"token":"eyJ...","user":{...}}

# e) Usar el token para una ruta protegida:
TOKEN=$(curl -s -X POST https://wallet-7v82.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mauiturriza@gmail.com","password":"admin123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s https://wallet-7v82.onrender.com/api/accounts \
  -H "Authorization: Bearer $TOKEN"
# → [ ...tus cuentas... ]  (HTTP 200)
```

> Si el servicio estaba dormido (free tier), el **primer** curl puede tardar ~30–60 s en responder mientras
> Render lo despierta. Reintentá.

---

## 3) Build del APK con EAS

### 3.1 Variables de entorno del build

Ya están resueltas en `mobile/eas.json` → perfil **`preview`**:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "env": { "EXPO_PUBLIC_API_URL": "https://wallet-7v82.onrender.com/api" }
}
```

- `EXPO_PUBLIC_API_URL` se inyecta en el build y lo lee `mobile/src/api/client.ts:60`
  (`process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.0.12:3000/api'`). En el APK toma el de Render; el
  fallback `192.168.0.12` es solo para correr en dev sobre tu LAN.
- **No necesitás `mobile/.env`** (no existe y no hace falta): el valor vive en `eas.json`. Si en el futuro
  movés la URL, editá ese `env` del perfil `preview`.

### 3.2 Comando de build (perfil que ya existe)

```bash
cd /home/mauro/Documents/proyectos/wallet/mobile

# Login en Expo (cuenta owner = maurarch) si no lo estás:
npx eas login        # o: npx eas whoami   para verificar

# Build del APK (perfil preview → buildType apk, en los servidores de EAS):
npx eas build --platform android --profile preview
```

> - Usa la cuenta `maurarch` y el `projectId d1a959a4-1885-4e2e-a90d-53838005629a` (de `mobile/app.json`).
> - Al terminar, EAS imprime una **URL de descarga** del `.apk` y queda en
>   `https://expo.dev/accounts/maurarch/projects/wallet-clone/builds`.
> - Si querés compilar local en vez de en la nube: agregá `--local` (requiere Android SDK/JDK instalados).

### 3.3 Descargar e instalar el APK

```bash
# Opción A: con adb (teléfono conectado por USB, depuración USB activada)
adb install -r ~/Downloads/wallet-clone.apk     # ajustá el nombre/ruta del .apk descargado

# Opción B: ver el último build y bajar el APK por consola
cd /home/mauro/Documents/proyectos/wallet/mobile
npx eas build:list --platform android --limit 1
# Copiá la "Artifact URL" y descargalo, o abrí la URL en el teléfono y instalá
# (hay que permitir "Instalar apps de orígenes desconocidos" en Android).
```

> El primer arranque del APK contra Render free tier puede tardar si el server estaba dormido; reintentá el login.

---

## 4) Troubleshooting

**El APK login da error / "No se pudo conectar con el servidor".**
- Render free tier **duerme** tras ~15 min de inactividad. El primer request tarda ~30–60 s. Reintentá.
  Verificá que despierta: `curl https://wallet-7v82.onrender.com/health`.
- El `timeout` de Axios es **5 s** (`mobile/src/api/client.ts:64`). Si el server estaba frío, el primer login
  puede pasarse de 5 s → da timeout. Reintentá una vez que `/health` responda rápido.

**`/api/auth/...` sigue dando 404 después del deploy.**
- Render desplegó código viejo. Confirmá que el commit de auth llegó a la rama que Render despliega:
  `git log --oneline origin/main -1` debe mostrar `8db4099` (o más nuevo). Si no, repetí el paso **1.1**
  (merge `APK → main` + push). En Render → **Manual Deploy → Clear build cache & deploy** para forzar.

**`/api/accounts` devuelve 200 SIN token.**
- Es la versión vieja single-user. Mismo problema que arriba: el deploy no tomó el código de auth. Redeployá.

**El server no arranca en Render / crashea al boot.**
- Falta `JWT_SECRET` o `DATABASE_URL`. El middleware de auth exige `JWT_SECRET` y `connection.ts` lanza si no
  hay `DATABASE_URL`. Revisá **Settings → Environment** y los logs del deploy.

**Build de Render falla en `pnpm` / "command not found".**
- Asegurá el Build Command `corepack enable && pnpm install --frozen-lockfile && pnpm run build` y
  **Root Directory = `server`**. Si `--frozen-lockfile` falla por lockfile desactualizado, corré
  `pnpm install` localmente en `server/`, commiteá el `pnpm-lock.yaml` y redeployá.

**"relation ... does not exist" / faltan columnas `user_id` en runtime.**
- La DB no tiene las migraciones. No es el caso hoy (verificado), pero si pasara: `cd server && pnpm db:migrate`.
  Es idempotente.

**Login dice credenciales inválidas con `admin123`.**
- La pass del admin fue cambiada desde la app, o `db:seed` no corrió. Para resetear a `admin123`:
  `cd server && pnpm db:seed` (rehashea la pass del admin a `admin123`). Después cambiala en *Más → Perfil*.

**El APK apunta a `localhost` / `192.168.0.12` y no a Render.**
- Estás corriendo en dev (Expo Go) o el build no tomó `eas.json`. En el APK de EAS, `EXPO_PUBLIC_API_URL` viene
  del `env` del perfil `preview`. Verificá que buildeaste con `--profile preview` y que ese `env` siga apuntando
  a `https://wallet-7v82.onrender.com/api`.

**CORS bloquea requests.**
- Solo afecta a clientes web (mandan `Origin`). El APK nativo **no** manda `Origin`, nunca lo afecta. Si servís
  un frontend web, definí `CORS_ORIGINS` en Render con la lista de orígenes permitidos (separados por coma).

**Las stats/insights no reflejan un cambio reciente.**
- Hay caché en proceso: stats 5 min, insights 10 min, accounts/summary 5 min. Cualquier **mutación** del usuario
  la invalida; o forzá bypass con `?refresh=true`. Además, en Render free, un reinicio del proceso vacía la caché.
```
