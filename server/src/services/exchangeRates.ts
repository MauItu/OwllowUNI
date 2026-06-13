import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { exchangeRates } from '../db/schema.js';

/**
 * Servicio de tasas de cambio.
 *
 * Fuentes (gratuitas, sin API key):
 *  1. Frankfurter (https://api.frankfurter.dev) — datos del BCE. NO cubre todas
 *     las monedas (p.ej. COP y VES no están en la lista del BCE).
 *  2. open.er-api.com (ExchangeRate-API, acceso abierto) — cobertura amplia,
 *     incluye COP. Se usa como fallback y, en la práctica, para todo lo que
 *     Frankfurter no soporta.
 *
 * Cache: se guarda cada par (base→target) en la tabla `exchange_rates`. Si la
 * tasa cacheada tiene <24h se reutiliza; si no, se refresca. Si la API está
 * caída se devuelve la última tasa conocida con `stale: true`.
 *
 * Tasas manuales (`is_manual`): las fija el usuario y NUNCA se sobreescriben
 * con el refresco automático.
 *
 * ⚠️ VES (bolívar venezolano): puede no estar disponible en ninguna de las dos
 * APIs gratuitas. En ese caso la tasa queda `null` y el usuario debe fijarla a
 * mano vía `PUT /api/rates/manual`.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 8000;

export interface RateResult {
  base: string;
  target: string;
  /** null = no se pudo obtener (ni cache, ni manual, ni API). */
  rate: number | null;
  stale: boolean;
  isManual: boolean;
  fetchedAt: string | null;
}

const norm = (c: string) => c.trim().toUpperCase();

async function tryFetch(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // Fallo de red/timeout/parseo de la API externa: caemos al fallback (null),
    // pero logueamos para no perder el diagnóstico si una fuente cambia su contrato.
    console.warn('[exchangeRates] tryFetch falló:', url, err);
    return null;
  }
}

/**
 * Obtiene tasas base→targets de las APIs externas. Devuelve solo las monedas
 * que pudo resolver. Acepta Frankfurter únicamente si trae TODOS los targets
 * pedidos (si falta alguno —p.ej. COP/VES— cae al fallback más completo).
 */
async function fetchExternal(base: string, targets: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (targets.length === 0) return out;

  // 1) Frankfurter
  const fr = await tryFetch(
    `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${targets.join(',')}`,
  );
  if (fr?.rates && targets.every((t) => typeof fr.rates[t] === 'number')) {
    for (const t of targets) out[t] = fr.rates[t];
    return out;
  }

  // 2) open.er-api.com (un solo request con base, devuelve todas las monedas)
  const er = await tryFetch(`https://open.er-api.com/v6/latest/${base}`);
  if (er?.result === 'success' && er.rates) {
    for (const t of targets) {
      if (typeof er.rates[t] === 'number') out[t] = er.rates[t];
    }
  }
  return out;
}

/** Inserta o actualiza tasas automáticas (respeta las manuales: no las toca). */
async function upsertRates(
  uid: number,
  base: string,
  rates: { target: string; rate: number }[],
): Promise<void> {
  if (rates.length === 0) return;
  const now = new Date();
  await db
    .insert(exchangeRates)
    .values(
      rates.map((r) => ({
        userId: uid,
        baseCurrency: base,
        targetCurrency: r.target,
        rate: r.rate.toFixed(8),
        isManual: false,
        fetchedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [exchangeRates.userId, exchangeRates.baseCurrency, exchangeRates.targetCurrency],
      set: { rate: sql`excluded.rate`, fetchedAt: now, isManual: false },
      // Nunca pisar una tasa manual.
      setWhere: eq(exchangeRates.isManual, false),
    });
}

/**
 * Devuelve las tasas base→targets, usando cache (<24h), refrescando lo vencido
 * y respetando manuales. `force` ignora el TTL (refresco manual del usuario).
 */
export async function getRates(
  uid: number,
  baseRaw: string,
  targetsRaw: string[],
  force = false,
): Promise<RateResult[]> {
  const base = norm(baseRaw);
  const targets = [...new Set(targetsRaw.map(norm))];

  const cached = targets.length
    ? await db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.userId, uid),
            eq(exchangeRates.baseCurrency, base),
            inArray(exchangeRates.targetCurrency, targets),
          ),
        )
    : [];
  const cachedMap = new Map(cached.map((r) => [r.targetCurrency, r]));
  const now = Date.now();

  const needRefresh = targets.filter((t) => {
    if (t === base) return false;
    const c = cachedMap.get(t);
    if (c?.isManual) return false; // manual: nunca refrescar
    if (!c) return true;
    return force || now - c.fetchedAt.getTime() >= TTL_MS;
  });

  const fetched = needRefresh.length ? await fetchExternal(base, needRefresh) : {};

  const results: RateResult[] = [];
  const toUpsert: { target: string; rate: number }[] = [];

  for (const t of targets) {
    if (t === base) {
      results.push({ base, target: t, rate: 1, stale: false, isManual: false, fetchedAt: new Date(now).toISOString() });
      continue;
    }
    const c = cachedMap.get(t);
    if (c?.isManual) {
      results.push({ base, target: t, rate: Number(c.rate), stale: false, isManual: true, fetchedAt: c.fetchedAt.toISOString() });
      continue;
    }
    const live = fetched[t];
    if (typeof live === 'number') {
      toUpsert.push({ target: t, rate: live });
      results.push({ base, target: t, rate: live, stale: false, isManual: false, fetchedAt: new Date(now).toISOString() });
    } else if (c) {
      // Había que refrescar pero la API falló → tasa vieja marcada como stale.
      const stale = needRefresh.includes(t);
      results.push({ base, target: t, rate: Number(c.rate), stale, isManual: false, fetchedAt: c.fetchedAt.toISOString() });
    } else {
      // Sin cache y sin respuesta de la API (p.ej. VES no soportada).
      results.push({ base, target: t, rate: null, stale: true, isManual: false, fetchedAt: null });
    }
  }

  if (toUpsert.length) await upsertRates(uid, base, toUpsert);
  return results;
}

/** Tasa puntual base→target (1 si son iguales). */
export async function getRate(uid: number, base: string, target: string): Promise<RateResult> {
  const [r] = await getRates(uid, base, [target]);
  return r;
}

export interface ConversionMap {
  /** Factor para convertir un monto EN `currency` A `displayCurrency`. */
  map: Map<string, number>;
  /** true si alguna tasa usada está vencida/desconocida (fallback 1:1). */
  stale: boolean;
  /** Fecha de actualización más antigua entre las tasas usadas. */
  oldestFetchedAt: string | null;
}

/**
 * Construye un mapa de conversión currency→displayCurrency para un conjunto de
 * monedas. Se piden las tasas con base=displayCurrency y se invierten
 * (`amount_display = amount_currency / rate(display→currency)`).
 *
 * Monedas con tasa desconocida caen a 1:1 y marcan `stale=true` (caso extremo:
 * API caída sin cache y sin tasa manual).
 */
export async function getConversionMap(
  uid: number,
  displayRaw: string,
  currenciesRaw: string[],
  force = false,
): Promise<ConversionMap> {
  const display = norm(displayRaw);
  const currencies = [...new Set(currenciesRaw.map(norm))].filter((c) => c !== display);
  const map = new Map<string, number>([[display, 1]]);

  if (currencies.length === 0) {
    return { map, stale: false, oldestFetchedAt: new Date().toISOString() };
  }

  const results = await getRates(uid, display, currencies, force);
  let stale = false;
  let oldest: number | null = null;

  for (const r of results) {
    if (r.rate != null && r.rate > 0) {
      map.set(r.target, 1 / r.rate);
    } else {
      map.set(r.target, 1); // fallback 1:1
      stale = true;
    }
    if (r.stale) stale = true;
    if (r.fetchedAt) {
      const t = new Date(r.fetchedAt).getTime();
      if (oldest == null || t < oldest) oldest = t;
    }
  }

  return { map, stale, oldestFetchedAt: oldest != null ? new Date(oldest).toISOString() : null };
}

/** Fija una tasa manual (no se sobreescribe con el refresco automático). */
export async function setManualRate(uid: number, baseRaw: string, targetRaw: string, rate: number) {
  const base = norm(baseRaw);
  const target = norm(targetRaw);
  const now = new Date();
  const [row] = await db
    .insert(exchangeRates)
    .values({
      userId: uid,
      baseCurrency: base,
      targetCurrency: target,
      rate: rate.toFixed(8),
      isManual: true,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: [exchangeRates.userId, exchangeRates.baseCurrency, exchangeRates.targetCurrency],
      set: { rate: rate.toFixed(8), isManual: true, fetchedAt: now },
    })
    .returning();
  return row;
}
