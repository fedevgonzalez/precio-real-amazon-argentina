# Precio real Amazon Argentina — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensión MV3 que en amazon.com y amazon.es muestra el costo final en ARS (dólar blue y tarjeta) con impuestos de importación por courier.

**Architecture:** Content script (parser + inject) sin lógica de negocio; service worker que trae y cachea cotizaciones; `calc.js` como función pura con las reglas inyectadas desde `rules.json`. Sin backend ni paso de build: módulos ES cargados con `import()` dinámico desde un `loader.js`.

**Tech Stack:** JavaScript plano (ES modules) + JSDoc, Chrome/Edge MV3, Vitest + jsdom para tests, Playwright para la verificación manual en navegador real.

**Spec:** `docs/superpowers/specs/2026-09-29-amazon-argentina-design.md`

## Global Constraints

- Manifest V3, Chrome/Edge; instalación con "Cargar descomprimida"; sin Web Store.
- JS plano con JSDoc, **sin compilación ni bundler**. Los tests corren con `npm test` (Vitest).
- Tiendas soportadas: solo `amazon.com` (USD) y `amazon.es` (EUR).
- Base de cálculo = precio + envío, **sin** el "import fees" de Amazon.
- Un solo redondeo, al final, a pesos enteros.
- Nunca mostrar un número inventado: sin cotización → "Sin cotización disponible"; sin precio → no inyectar nada.
- Cotizaciones: 2 fuentes por valor; timeout 4 s; caché 10 min en `chrome.storage.local`; discrepancia > 5 % → advertencia.
- Ajustes del usuario (`enviosUsados`, `ivaReducido`, `unidades`) en `chrome.storage.sync`.
- Ningún dato del usuario sale de la extensión; solo se consultan cotizaciones.
- Todo texto visible al usuario en español (es-AR). El bloque incluye siempre el aviso "Estimación, puede diferir del cargo final."
- Insertar contenido en el DOM solo con `textContent` / `createElement`, nunca `innerHTML` con datos externos.
- Las reglas impositivas (`rules.json`) vienen de impuestito.org y **no están verificadas**: la Tarea 2 las contrasta con fuentes oficiales.

## Review Focus

Entradas o condiciones que el spec implica pero que ninguna prueba obvia cubriría; cada una tiene su test en la tarea indicada.

1. Separadores de miles/decimales: `$1,299.99` (amazon.com) vs `1.299,99 €` (amazon.es) → debe dar 1299.99 en ambos (Tarea 5).
2. Amazon combina "Shipping & Import Fees" en una sola línea: el envío no debe sumarse (duplicaría impuestos); queda `envio: null` + aviso (Tareas 5 y 6).
3. Service worker dormido o APIs caídas con caché vencido: se usa lo cacheado marcado como viejo, o error explícito si no hay nada (Tarea 4).
4. Página sin precio, producto que no se envía a Argentina o moneda inesperada: no se inyecta cálculo (Tareas 5 y 6).
5. Rango de precios ("$20 – $35"): se calculan ambos extremos y se muestra el rango (Tareas 5 y 6).

Nota de riesgo abierta (no se resuelve con tests): el spec aplica la percepción de tarjeta sobre el total con impuestos, pero en la práctica los tributos aduaneros se pagan en pesos al courier, no con la tarjeta. La Tarea 2 debe decidirlo con evidencia y, si corresponde, ajustar `rules.json` y `calc.js`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json`, `vitest.config.js` | Tooling de tests |
| `src/core/rules.json` | Reglas impositivas y parámetros de caché |
| `src/core/calc.js` | Cálculo puro |
| `src/core/settings.js` | Normalizar/cargar/guardar ajustes (recibe un `storage` adaptador) |
| `src/background/rates.js` | Traer, validar y cachear cotizaciones |
| `src/background/worker.js` | Entrada del service worker; responde `GET_RATES` |
| `src/content/parser.js` | Leer precio, envío y moneda del DOM de Amazon |
| `src/content/inject.js` | Construir y montar el bloque en pesos |
| `src/content/run.js` | Orquesta parser → rates → calc → inject + MutationObserver |
| `src/content/loader.js` | Content script clásico que hace `import()` de `run.js` |
| `src/options/options.html`, `options.js` | Popup/opciones con los ajustes |
| `manifest.json` | Manifest MV3 |
| `scripts/e2e.mjs` | Verificación manual en Chromium real |
| `tests/**` | Tests y fixtures |

---

### Task 1: Tooling y reglas base

**Files:**
- Create: `package.json`, `vitest.config.js`, `src/core/rules.json`, `tests/rules.test.js`, `tests/fixtures/test-rules.js`

**Interfaces:**
- Produces: `rules.json` con las claves `franquiciaUsd, cupoEnvios, ivaGeneral, ivaReducido, arancelGeneral, topeFobUsd, maxUnidades, percepcionTarjeta, cache{minutos,timeoutMs,discrepanciaMax}`; `RULES` (mismo shape) exportado desde `tests/fixtures/test-rules.js` para tests desacoplados de los valores reales.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "amazon-argentina-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "jsdom": "^26.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Crear `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.js'] },
});
```

- [ ] **Step 3: Crear `src/core/rules.json`** (valores del spec; se verifican en la Tarea 2)

```json
{
  "version": 1,
  "franquiciaUsd": 400,
  "cupoEnvios": 5,
  "ivaGeneral": 0.21,
  "ivaReducido": 0.105,
  "arancelGeneral": 0.35,
  "topeFobUsd": 3000,
  "maxUnidades": 3,
  "percepcionTarjeta": 0.3,
  "cache": { "minutos": 10, "timeoutMs": 4000, "discrepanciaMax": 0.05 }
}
```

- [ ] **Step 4: Crear `tests/fixtures/test-rules.js`**

```js
/** Reglas fijas para tests: no cambian si se actualiza rules.json. */
export const RULES = {
  franquiciaUsd: 400,
  cupoEnvios: 5,
  ivaGeneral: 0.21,
  ivaReducido: 0.105,
  arancelGeneral: 0.35,
  topeFobUsd: 3000,
  maxUnidades: 3,
  percepcionTarjeta: 0.3,
  cache: { minutos: 10, timeoutMs: 50, discrepanciaMax: 0.05 },
};
```

- [ ] **Step 5: Escribir el test de forma de `rules.json`**

`tests/rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import rules from '../src/core/rules.json';

describe('rules.json', () => {
  it('tiene todas las claves numéricas positivas', () => {
    for (const k of ['franquiciaUsd', 'cupoEnvios', 'ivaGeneral', 'ivaReducido', 'arancelGeneral', 'topeFobUsd', 'maxUnidades', 'percepcionTarjeta']) {
      expect(typeof rules[k], k).toBe('number');
      expect(rules[k], k).toBeGreaterThan(0);
    }
    expect(rules.cache.minutos).toBeGreaterThan(0);
    expect(rules.cache.timeoutMs).toBeGreaterThan(0);
    expect(rules.cache.discrepanciaMax).toBeGreaterThan(0);
  });

  it('las alícuotas son fracciones, no porcentajes', () => {
    for (const k of ['ivaGeneral', 'ivaReducido', 'arancelGeneral', 'percepcionTarjeta']) {
      expect(rules[k], k).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 6: Instalar y correr**

Run: `npm install && npm test`
Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/core/rules.json tests
git commit -m "chore: tooling de tests y rules.json base"
```

---

### Task 2: Verificar las reglas impositivas contra fuentes oficiales

**Files:**
- Create: `docs/rules-verification.md`
- Modify: `src/core/rules.json` (solo si algún valor no coincide)

**Interfaces:**
- Consumes: claves de `rules.json` (Tarea 1).
- Produces: `docs/rules-verification.md` con una tabla `regla | valor en rules.json | fuente oficial (URL) | ¿coincide? | acción`, y una decisión escrita sobre las dos preguntas abiertas de abajo.

Esta tarea es de investigación; no lleva test de código. Su entregable es el documento y, si corresponde, `rules.json` corregido.

- [ ] **Step 1: Buscar y leer las fuentes oficiales**

Usar WebSearch y WebFetch sobre ARCA (argentina.gob.ar/arca, sección envíos internacionales / Puerta a Puerta) y el Boletín Oficial (Decreto 604/2026 y RG ARCA 5884/2026). Para cada regla de la tabla del Step 3 registrar la URL exacta que la respalda.

- [ ] **Step 2: Resolver las dos preguntas abiertas**

1. **Arancel general** sobre el excedente de USD 400 en courier: ¿cuál es la alícuota que corresponde y depende de la posición arancelaria? Fijar un valor por defecto razonable y documentar el rango real.
2. **Percepción de tarjeta:** ¿aplica sobre el total con impuestos o solo sobre lo pagado con tarjeta a Amazon (precio + envío)? ¿Los tributos aduaneros se pagan en pesos al courier? ¿Con qué cotización? Si la respuesta difiere del spec, escribirlo en el documento como "Cambio necesario en calc.js" (se implementa en la Tarea 3 antes de escribir código).

- [ ] **Step 3: Escribir `docs/rules-verification.md`**

Tabla con estas filas mínimas: franquicia USD 400 FOB, cupo de 5 envíos, IVA 21 %, IVA reducido, arancel general por defecto, tope USD 3.000 FOB, máximo 3 unidades por especie, percepción de tarjeta 30 %, Impuesto PAIS derogado. Cada fila con URL de la fuente. Debajo, las decisiones del Step 2 con su justificación.

- [ ] **Step 4: Aplicar correcciones a `rules.json` si hace falta y correr tests**

Run: `npm test`
Expected: PASS (los tests de forma de `rules.json` siguen válidos).

- [ ] **Step 5: Commit**

```bash
git add docs/rules-verification.md src/core/rules.json
git commit -m "docs: verificación de reglas impositivas contra fuentes oficiales"
```

---

### Task 3: `calc.js` — cálculo puro

**Files:**
- Create: `src/core/calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: shape de `RULES` (Tarea 1). **Antes de escribir, leer `docs/rules-verification.md`**: si la Tarea 2 decidió cambiar la base de la percepción, ajustar el cálculo de `tarjetaArs` y el test correspondiente antes de continuar.
- Produces:

```js
/**
 * @typedef {{precio:number, envio?:number, moneda:'USD'|'EUR'}} Item
 * @typedef {{blue:number, oficial:number, eurUsd?:number}} Rates
 * @typedef {{enviosUsados?:number, ivaReducido?:boolean, unidades?:number}} Settings
 * @typedef {{ok:true, fobUsd:number, franquiciaAplicadaUsd:number, arancelUsd:number,
 *   ivaUsd:number, totalUsd:number, blueArs:number, tarjetaArs:number,
 *   masBarata:'blue'|'tarjeta', avisos:string[]}
 *  | {ok:false, error:'INVALID_INPUT'|'NO_RATES'}} CalcResult
 */
export function calc(item, rates, settings, rules) /* → CalcResult */
```

`avisos` puede contener `'FUERA_REGIMEN_SIMPLIFICADO'`.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/calc.test.js` (valores esperados calculados a mano con blue 1500, oficial 1000, percepción 30 %):

```js
import { describe, it, expect } from 'vitest';
import { calc } from '../src/core/calc.js';
import { RULES } from './fixtures/test-rules.js';

const RATES = { blue: 1500, oficial: 1000, eurUsd: 1.1 };
const S = { enviosUsados: 0, ivaReducido: false, unidades: 1 };
const run = (item, settings = {}, rates = RATES) => calc(item, rates, { ...S, ...settings }, RULES);

describe('calc', () => {
  it('dentro de franquicia: solo IVA', () => {
    const r = run({ precio: 100, envio: 10, moneda: 'USD' });
    expect(r.ok).toBe(true);
    expect(r.fobUsd).toBeCloseTo(110);
    expect(r.franquiciaAplicadaUsd).toBeCloseTo(110);
    expect(r.arancelUsd).toBe(0);
    expect(r.ivaUsd).toBeCloseTo(23.1);
    expect(r.totalUsd).toBeCloseTo(133.1);
    expect(r.blueArs).toBe(199650);
    expect(r.tarjetaArs).toBe(173030);
    expect(r.masBarata).toBe('tarjeta');
    expect(r.avisos).toEqual([]);
  });

  it('justo en USD 400: sin arancel', () => {
    const r = run({ precio: 400, moneda: 'USD' });
    expect(r.arancelUsd).toBe(0);
    expect(r.ivaUsd).toBeCloseTo(84);
    expect(r.totalUsd).toBeCloseTo(484);
  });

  it('excedente sobre USD 400 paga arancel e IVA sobre (fob + arancel)', () => {
    const r = run({ precio: 500, moneda: 'USD' });
    expect(r.franquiciaAplicadaUsd).toBe(400);
    expect(r.arancelUsd).toBeCloseTo(35);
    expect(r.ivaUsd).toBeCloseTo(112.35);
    expect(r.totalUsd).toBeCloseTo(647.35);
    expect(r.blueArs).toBe(971025);
    expect(r.tarjetaArs).toBe(841555);
  });

  it('cupo agotado: régimen general sobre el total', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { enviosUsados: 5 });
    expect(r.franquiciaAplicadaUsd).toBe(0);
    expect(r.arancelUsd).toBeCloseTo(35);
    expect(r.ivaUsd).toBeCloseTo(28.35);
    expect(r.totalUsd).toBeCloseTo(163.35);
    expect(r.blueArs).toBe(245025);
    expect(r.tarjetaArs).toBe(212355);
  });

  it('con 4 envíos usados todavía hay cupo', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { enviosUsados: 4 });
    expect(r.franquiciaAplicadaUsd).toBe(100);
  });

  it('EUR se convierte con eurUsd', () => {
    const r = run({ precio: 100, envio: 0, moneda: 'EUR' });
    expect(r.fobUsd).toBeCloseTo(110);
    expect(r.totalUsd).toBeCloseTo(133.1);
    expect(r.blueArs).toBe(199650);
  });

  it('IVA reducido', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { ivaReducido: true });
    expect(r.ivaUsd).toBeCloseTo(10.5);
    expect(r.totalUsd).toBeCloseTo(110.5);
    expect(r.blueArs).toBe(165750);
  });

  it('marca blue como más barata cuando corresponde', () => {
    const r = run({ precio: 100, envio: 10, moneda: 'USD' }, {}, { ...RATES, blue: 1200 });
    expect(r.blueArs).toBe(159720);
    expect(r.masBarata).toBe('blue');
  });

  it.each([
    [{ precio: 0, moneda: 'USD' }],
    [{ precio: NaN, moneda: 'USD' }],
    [{ precio: -5, moneda: 'USD' }],
    [{ precio: 10, envio: -1, moneda: 'USD' }],
    [{ precio: 10, moneda: 'GBP' }],
    [undefined],
  ])('entrada inválida %j → INVALID_INPUT', (item) => {
    expect(run(item)).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('sin cotizaciones → NO_RATES', () => {
    expect(run({ precio: 10, moneda: 'USD' }, {}, { blue: 0, oficial: 1000 })).toEqual({ ok: false, error: 'NO_RATES' });
    expect(run({ precio: 10, moneda: 'EUR' }, {}, { blue: 1500, oficial: 1000 })).toEqual({ ok: false, error: 'NO_RATES' });
  });

  it('USD no necesita eurUsd', () => {
    expect(run({ precio: 10, moneda: 'USD' }, {}, { blue: 1500, oficial: 1000 }).ok).toBe(true);
  });

  it('avisa si sale del régimen simplificado', () => {
    expect(run({ precio: 3500, moneda: 'USD' }).avisos).toContain('FUERA_REGIMEN_SIMPLIFICADO');
    expect(run({ precio: 100, moneda: 'USD' }, { unidades: 4 }).avisos).toContain('FUERA_REGIMEN_SIMPLIFICADO');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/calc.test.js`
Expected: FAIL (`Cannot find module '../src/core/calc.js'`).

- [ ] **Step 3: Implementar `src/core/calc.js`**

```js
/** Cálculo puro del costo final en ARS. Sin DOM ni red. Ver typedefs en el plan (Tarea 3). */
export function calc(item, rates, settings, rules) {
  const { precio, envio = 0, moneda } = item ?? {};
  const valid =
    Number.isFinite(precio) && precio > 0 &&
    Number.isFinite(envio) && envio >= 0 &&
    (moneda === 'USD' || moneda === 'EUR');
  if (!valid) return { ok: false, error: 'INVALID_INPUT' };

  const pos = (v) => Number.isFinite(v) && v > 0;
  if (!pos(rates?.blue) || !pos(rates?.oficial) || (moneda === 'EUR' && !pos(rates.eurUsd))) {
    return { ok: false, error: 'NO_RATES' };
  }

  const { enviosUsados = 0, ivaReducido = false, unidades = 1 } = settings ?? {};
  const fobUsd = (precio + envio) * (moneda === 'EUR' ? rates.eurUsd : 1);
  const conCupo = enviosUsados < rules.cupoEnvios;
  const franquiciaAplicadaUsd = conCupo ? Math.min(fobUsd, rules.franquiciaUsd) : 0;
  const arancelUsd = (fobUsd - franquiciaAplicadaUsd) * rules.arancelGeneral;
  const ivaUsd = (fobUsd + arancelUsd) * (ivaReducido ? rules.ivaReducido : rules.ivaGeneral);
  const totalUsd = fobUsd + arancelUsd + ivaUsd;

  const blueArs = Math.round(totalUsd * rates.blue);
  const tarjetaArs = Math.round(totalUsd * rates.oficial * (1 + rules.percepcionTarjeta));

  const avisos = [];
  if (fobUsd > rules.topeFobUsd || unidades > rules.maxUnidades) avisos.push('FUERA_REGIMEN_SIMPLIFICADO');

  return {
    ok: true,
    fobUsd, franquiciaAplicadaUsd, arancelUsd, ivaUsd, totalUsd,
    blueArs, tarjetaArs,
    masBarata: blueArs <= tarjetaArs ? 'blue' : 'tarjeta',
    avisos,
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/calc.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/core/calc.js tests/calc.test.js
git commit -m "feat: calc.js con franquicia, cupo, IVA, blue y tarjeta"
```

---

### Task 4: `rates.js` y service worker

**Files:**
- Create: `src/background/rates.js`, `src/background/worker.js`
- Test: `tests/rates.test.js`

**Interfaces:**
- Consumes: `rules.cache` (Tarea 1).
- Produces:

```js
export const SOURCES = { blue: [{url, pick}, {url, pick}], oficial: [...], eurUsd: [...] };
/** storage: {get(key)→Promise<any>, set(key,val)→Promise<void>} */
export async function getRates({ fetchFn, storage, rules, now = Date.now })
// → { ok:true, rates:{blue,oficial,eurUsd?}, fetchedAt:number, stale:boolean, discrepancy:boolean }
// | { ok:false, error:'NO_RATES' }
```
El worker responde al mensaje `{type:'GET_RATES'}` con ese mismo objeto.

- [ ] **Step 1: Verificar la forma real de las APIs**

Run: `curl -s https://dolarapi.com/v1/dolares/blue; curl -s https://api.bluelytics.com.ar/v2/latest; curl -s "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD"; curl -s https://open.er-api.com/v6/latest/EUR`
Expected: `dolarapi` con campo `venta`; `bluelytics` con `blue.value_sell` y `oficial.value_sell`; `frankfurter` y `er-api` con `rates.USD`. **Si alguna forma difiere, ajustar los `pick` de `SOURCES` en el Step 3 y las respuestas simuladas del Step 2.**

- [ ] **Step 2: Escribir los tests que fallan**

`tests/rates.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { getRates, SOURCES } from '../src/background/rates.js';
import { RULES } from './fixtures/test-rules.js';

const U = {
  blue1: SOURCES.blue[0].url, blue2: SOURCES.blue[1].url,
  of1: SOURCES.oficial[0].url, of2: SOURCES.oficial[1].url,
  eur1: SOURCES.eurUsd[0].url, eur2: SOURCES.eurUsd[1].url,
};
const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
const HAPPY = {
  [U.blue1]: okJson({ venta: 1500 }),
  [U.blue2]: okJson({ blue: { value_sell: 1510 }, oficial: { value_sell: 1000 } }),
  [U.of1]: okJson({ venta: 1000 }),
  [U.eur1]: okJson({ rates: { USD: 1.1 } }),
  [U.eur2]: okJson({ rates: { USD: 1.1 } }),
};
function makeFetch(map) {
  return vi.fn((url, { signal } = {}) => {
    const h = map[url];
    if (h === 'hang') return new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
    if (!h) return Promise.reject(new Error('sin ruta'));
    return Promise.resolve(h);
  });
}
function makeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), _m: m };
}
const ctx = (fetchFn, storage, now = () => 1_000_000) => ({ fetchFn, storage, rules: RULES, now });

describe('getRates', () => {
  it('caso feliz: usa la fuente primaria, guarda en caché', async () => {
    const storage = makeStorage();
    const r = await getRates(ctx(makeFetch(HAPPY), storage));
    expect(r).toMatchObject({ ok: true, stale: false, discrepancy: false, fetchedAt: 1_000_000 });
    expect(r.rates).toEqual({ blue: 1500, oficial: 1000, eurUsd: 1.1 });
    expect(storage._m.get('rates').rates.blue).toBe(1500);
  });

  it('si la primaria falla usa la de respaldo', async () => {
    const map = { ...HAPPY };
    delete map[U.blue1];
    const r = await getRates(ctx(makeFetch(map), makeStorage()));
    expect(r.rates.blue).toBe(1510);
    expect(r.stale).toBe(false);
  });

  it('cotizaciones que difieren >5 % → discrepancy true', async () => {
    const map = { ...HAPPY, [U.blue2]: okJson({ blue: { value_sell: 1700 }, oficial: { value_sell: 1000 } }) };
    const r = await getRates(ctx(makeFetch(map), makeStorage()));
    expect(r.ok).toBe(true);
    expect(r.discrepancy).toBe(true);
  });

  it('caché vigente: no consulta la red', async () => {
    const cached = { rates: { blue: 1400, oficial: 990, eurUsd: 1.05 }, fetchedAt: 1_000_000 - 60_000, discrepancy: false };
    const fetchFn = makeFetch(HAPPY);
    const r = await getRates(ctx(fetchFn, makeStorage({ rates: cached })));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, stale: false });
    expect(r.rates.blue).toBe(1400);
  });

  it('todo caído con caché vencido → devuelve lo cacheado como stale', async () => {
    const cached = { rates: { blue: 1400, oficial: 990, eurUsd: 1.05 }, fetchedAt: 1_000_000 - 3_600_000, discrepancy: false };
    const r = await getRates(ctx(makeFetch({}), makeStorage({ rates: cached })));
    expect(r).toMatchObject({ ok: true, stale: true, fetchedAt: cached.fetchedAt });
    expect(r.rates.blue).toBe(1400);
  });

  it('todo caído y sin caché → NO_RATES', async () => {
    expect(await getRates(ctx(makeFetch({}), makeStorage()))).toEqual({ ok: false, error: 'NO_RATES' });
  });

  it('eurUsd caído pero blue y oficial ok → sigue funcionando para USD', async () => {
    const map = { ...HAPPY };
    delete map[U.eur1]; delete map[U.eur2];
    const r = await getRates(ctx(makeFetch(map), makeStorage()));
    expect(r.ok).toBe(true);
    expect(r.rates.eurUsd).toBeUndefined();
  });

  it('respeta el timeout: una fuente colgada cuenta como caída', async () => {
    const map = { ...HAPPY, [U.blue1]: 'hang' };
    const r = await getRates(ctx(makeFetch(map), makeStorage()));
    expect(r.rates.blue).toBe(1510);
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run tests/rates.test.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar `src/background/rates.js`**

```js
export const SOURCES = {
  blue: [
    { url: 'https://dolarapi.com/v1/dolares/blue', pick: (j) => j?.venta },
    { url: 'https://api.bluelytics.com.ar/v2/latest', pick: (j) => j?.blue?.value_sell },
  ],
  oficial: [
    { url: 'https://dolarapi.com/v1/dolares/oficial', pick: (j) => j?.venta },
    { url: 'https://api.bluelytics.com.ar/v2/latest', pick: (j) => j?.oficial?.value_sell },
  ],
  eurUsd: [
    { url: 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD', pick: (j) => j?.rates?.USD },
    { url: 'https://open.er-api.com/v6/latest/EUR', pick: (j) => j?.rates?.USD },
  ],
};

async function fetchJson(fetchFn, url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta las 2 fuentes en paralelo. Devuelve {value, discrepancy} o null si ninguna respondió. */
async function resolveRate(name, fetchFn, rules) {
  const settled = await Promise.allSettled(
    SOURCES[name].map(async (s) => {
      const v = Number(s.pick(await fetchJson(fetchFn, s.url, rules.cache.timeoutMs)));
      if (!Number.isFinite(v) || v <= 0) throw new Error('valor inválido');
      return v;
    }),
  );
  const vals = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (!vals.length) return null;
  const discrepancy = vals.length === 2 && Math.abs(vals[0] - vals[1]) / vals[0] > rules.cache.discrepanciaMax;
  return { value: vals[0], discrepancy };
}

export async function getRates({ fetchFn, storage, rules, now = Date.now }) {
  const cached = await storage.get('rates');
  const ttl = rules.cache.minutos * 60_000;
  if (cached && now() - cached.fetchedAt < ttl) {
    return { ok: true, rates: cached.rates, fetchedAt: cached.fetchedAt, stale: false, discrepancy: !!cached.discrepancy };
  }

  const names = ['blue', 'oficial', 'eurUsd'];
  const fresh = await Promise.all(names.map((n) => resolveRate(n, fetchFn, rules)));

  const rates = {};
  let stale = false;
  let discrepancy = false;
  names.forEach((n, i) => {
    if (fresh[i]) {
      rates[n] = fresh[i].value;
      discrepancy ||= fresh[i].discrepancy;
    } else if (cached?.rates?.[n]) {
      rates[n] = cached.rates[n];
      stale = true;
    }
  });

  if (!rates.blue || !rates.oficial) return { ok: false, error: 'NO_RATES' };

  const fetchedAt = stale ? cached.fetchedAt : now();
  await storage.set('rates', { rates, fetchedAt, discrepancy });
  return { ok: true, rates, fetchedAt, stale, discrepancy };
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npx vitest run tests/rates.test.js`
Expected: PASS (8 tests).

- [ ] **Step 6: Crear `src/background/worker.js`** (capa fina; se verifica en la Tarea 8)

```js
import { getRates } from './rates.js';

const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k],
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

let rulesPromise;
const loadRules = () => (rulesPromise ??= fetch(chrome.runtime.getURL('src/core/rules.json')).then((r) => r.json()));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'GET_RATES') return false;
  loadRules()
    .then((rules) => getRates({ fetchFn: fetch.bind(globalThis), storage, rules }))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: 'NO_RATES' }));
  return true;
});
```

- [ ] **Step 7: Commit**

```bash
git add src/background tests/rates.test.js
git commit -m "feat: rates con doble fuente, timeout, caché y service worker"
```

---

### Task 5: `parser.js`

**Files:**
- Create: `src/content/parser.js`
- Test: `tests/parser.test.js`

**Interfaces:**
- Produces:

```js
export function parseAmount(text, locale /* 'en'|'es' */) // → number (NaN si no hay número)
export function parseProduct(doc, hostname)
// → { ok:true, moneda:'USD'|'EUR', precio:{min:number,max:number},
//     envio:number|null, envioIncluyeImportFees:boolean }
// | { ok:false, error:'UNSUPPORTED_HOST'|'PRICE_NOT_FOUND'|'UNEXPECTED_CURRENCY'|'NO_SHIP_TO_AR' }
```
`envio: null` significa "no se pudo leer" (el llamador debe avisar "envío no incluido").

Los fixtures de este test son **sintéticos** (imitan la estructura conocida de Amazon). La Tarea 8 agrega fixtures reales.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/parser.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseAmount, parseProduct } from '../src/content/parser.js';

const doc = (html) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
const price = (t, extra = '') => `<span class="a-price"><span class="a-offscreen">${t}</span></span>${extra}`;
const core = (inner) => `<div id="corePrice_feature_div">${inner}</div>`;
const delivery = (t) => `<div id="mir-layout-DELIVERY_BLOCK">${t}</div>`;

describe('parseAmount', () => {
  it('formato en (amazon.com)', () => {
    expect(parseAmount('$1,299.99', 'en')).toBe(1299.99);
    expect(parseAmount('$20', 'en')).toBe(20);
  });
  it('formato es (amazon.es)', () => {
    expect(parseAmount('1.299,99 €', 'es')).toBe(1299.99);
    expect(parseAmount('12,50 €', 'es')).toBe(12.5);
    expect(parseAmount('1.299 €', 'es')).toBe(1299);
  });
  it('sin número → NaN', () => {
    expect(parseAmount('gratis', 'en')).toBeNaN();
  });
});

describe('parseProduct', () => {
  it('amazon.com: precio simple, ignora el precio tachado, envío gratis', () => {
    const d = doc(core(price('$1,299.99') + `<span class="a-price a-text-price"><span class="a-offscreen">$1,499.99</span></span>`) + delivery('FREE delivery Tuesday'));
    expect(parseProduct(d, 'www.amazon.com')).toEqual({
      ok: true, moneda: 'USD', precio: { min: 1299.99, max: 1299.99 }, envio: 0, envioIncluyeImportFees: false,
    });
  });

  it('amazon.com: rango de precios', () => {
    const range = `<span class="a-price-range">${price('$20.00')}${price('$35.50')}</span>`;
    const r = parseProduct(doc(core(range) + delivery('FREE delivery')), 'www.amazon.com');
    expect(r.precio).toEqual({ min: 20, max: 35.5 });
  });

  it('amazon.es: euros con coma decimal y envío con monto', () => {
    const d = doc(core(price('1.299,99 €')) + delivery('Envío: 12,50 € Entrega el martes'));
    expect(parseProduct(d, 'www.amazon.es')).toEqual({
      ok: true, moneda: 'EUR', precio: { min: 1299.99, max: 1299.99 }, envio: 12.5, envioIncluyeImportFees: false,
    });
  });

  it('envío combinado con import fees → envio null y bandera (no duplicar impuestos)', () => {
    const d = doc(core(price('$50.00')) + delivery('$34.20 Shipping & Import Fees Deposit to Argentina'));
    const r = parseProduct(d, 'www.amazon.com');
    expect(r.ok).toBe(true);
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(true);
  });

  it('sin bloque de entrega → envio null sin bandera', () => {
    const r = parseProduct(doc(core(price('$50.00'))), 'www.amazon.com');
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(false);
  });

  it('sin precio → PRICE_NOT_FOUND', () => {
    expect(parseProduct(doc('<div>nada</div>'), 'www.amazon.com')).toEqual({ ok: false, error: 'PRICE_NOT_FOUND' });
  });

  it('moneda inesperada → UNEXPECTED_CURRENCY', () => {
    expect(parseProduct(doc(core(price('£10.00'))), 'www.amazon.com')).toEqual({ ok: false, error: 'UNEXPECTED_CURRENCY' });
  });

  it('no se envía a Argentina → NO_SHIP_TO_AR', () => {
    const d = doc(core(price('$10.00')) + delivery('This item cannot be shipped to your selected delivery location.'));
    expect(parseProduct(d, 'www.amazon.com')).toEqual({ ok: false, error: 'NO_SHIP_TO_AR' });
  });

  it('host no soportado → UNSUPPORTED_HOST', () => {
    expect(parseProduct(doc(core(price('$10.00'))), 'www.amazon.de')).toEqual({ ok: false, error: 'UNSUPPORTED_HOST' });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/parser.test.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/content/parser.js`**

```js
const STORES = [
  { host: /(^|\.)amazon\.com$/, moneda: 'USD', locale: 'en', symbol: '$' },
  { host: /(^|\.)amazon\.es$/, moneda: 'EUR', locale: 'es', symbol: '€' },
];
const PRICE_ROOTS = ['#corePrice_feature_div', '#corePriceDisplay_desktop_feature_div', '#apex_desktop'];
const DELIVERY = '#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage';
const NO_SHIP = /cannot be shipped|can't be shipped|does not ship|no se puede enviar|no puede enviarse|no se envía/i;
const IMPORT_FEES = /import fees|gastos de importaci|tasas de importaci/i;
const FREE = /\bfree\b|gratis/i;
const MONEY = /[$€]\s?[\d.,]+|[\d.,]+\s?€/;

export function parseAmount(text, locale) {
  const m = String(text).replace(/[\s ]/g, '').match(/[\d.,]+/);
  if (!m) return NaN;
  const s = locale === 'es' ? m[0].replace(/\./g, '').replace(',', '.') : m[0].replace(/,/g, '');
  return Number(s);
}

function findPriceTexts(doc) {
  for (const root of PRICE_ROOTS) {
    const el = doc.querySelector(root);
    if (!el) continue;
    const range = el.querySelector('.a-price-range');
    const nodes = range
      ? [...range.querySelectorAll('.a-offscreen')]
      : [el.querySelector('.a-price:not(.a-text-price) .a-offscreen')].filter(Boolean);
    if (nodes.length) return nodes.map((n) => n.textContent);
  }
  return [];
}

function parseShipping(doc, store) {
  const text = doc.querySelector(DELIVERY)?.textContent ?? '';
  if (IMPORT_FEES.test(text)) return { envio: null, envioIncluyeImportFees: true };
  if (FREE.test(text)) return { envio: 0, envioIncluyeImportFees: false };
  const money = text.match(MONEY);
  const envio = money ? parseAmount(money[0], store.locale) : NaN;
  return { envio: Number.isFinite(envio) ? envio : null, envioIncluyeImportFees: false };
}

export function parseProduct(doc, hostname) {
  const store = STORES.find((s) => s.host.test(hostname));
  if (!store) return { ok: false, error: 'UNSUPPORTED_HOST' };

  if (NO_SHIP.test(doc.querySelector(DELIVERY)?.textContent ?? '')) return { ok: false, error: 'NO_SHIP_TO_AR' };

  const texts = findPriceTexts(doc);
  if (!texts.length) return { ok: false, error: 'PRICE_NOT_FOUND' };
  if (texts.some((t) => !t.includes(store.symbol))) return { ok: false, error: 'UNEXPECTED_CURRENCY' };

  const amounts = texts.map((t) => parseAmount(t, store.locale));
  if (amounts.some((a) => !Number.isFinite(a) || a <= 0)) return { ok: false, error: 'PRICE_NOT_FOUND' };

  return {
    ok: true,
    moneda: store.moneda,
    precio: { min: Math.min(...amounts), max: Math.max(...amounts) },
    ...parseShipping(doc, store),
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/parser.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/content/parser.js tests/parser.test.js
git commit -m "feat: parser de precio, envío y moneda para amazon.com y amazon.es"
```

---

### Task 6: `inject.js` y `run.js`

**Files:**
- Create: `src/content/inject.js`, `src/core/settings.js`, `src/content/run.js`, `src/content/loader.js`
- Test: `tests/inject.test.js`, `tests/settings.test.js`

**Interfaces:**
- Consumes: `CalcResult` (Tarea 3), `getRates` response (Tarea 4), `parseProduct` result (Tarea 5).
- Produces:

```js
// inject.js
/** results: 1 o 2 CalcResult ok:true (mín y máx). notes: [{code:string, minutes?:number}] */
export function buildBlock(doc, { results, rates, fetchedAt, notes = [], error = null })
export function mount(doc, block) // → boolean (false si no hay ancla); reemplaza #aar-block previo

// settings.js
export const DEFAULTS = { enviosUsados: 0, ivaReducido: false, unidades: 1 };
export function normalizeSettings(raw)          // → Settings saneado
export async function loadSettings(storage)     // storage: {get,set}
export async function saveSettings(storage, raw) // → Settings guardado
```
Códigos de nota aceptados: `STALE_RATES` (usa `minutes`), `RATES_DISCREPANCY`, `ENVIO_NO_INCLUIDO`, `ENVIO_CON_IMPORT_FEES`, `FUERA_REGIMEN_SIMPLIFICADO`. `error` acepta `'NO_RATES'`.

- [ ] **Step 1: Tests de `settings.js` que fallan**

`tests/settings.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeSettings, loadSettings, saveSettings, DEFAULTS } from '../src/core/settings.js';

const mem = () => { const m = new Map(); return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) }; };

describe('settings', () => {
  it('defaults', () => expect(normalizeSettings(undefined)).toEqual(DEFAULTS));
  it('sanea valores inválidos', () => {
    expect(normalizeSettings({ enviosUsados: -3, unidades: 0, ivaReducido: 'sí' })).toEqual({ enviosUsados: 0, ivaReducido: false, unidades: 1 });
    expect(normalizeSettings({ enviosUsados: 'abc', unidades: 500 })).toEqual({ enviosUsados: 0, ivaReducido: false, unidades: 99 });
  });
  it('trunca decimales', () => expect(normalizeSettings({ enviosUsados: 2.9 }).enviosUsados).toBe(2));
  it('save y load hacen ida y vuelta', async () => {
    const s = mem();
    await saveSettings(s, { enviosUsados: 3, ivaReducido: true, unidades: 2 });
    expect(await loadSettings(s)).toEqual({ enviosUsados: 3, ivaReducido: true, unidades: 2 });
  });
  it('load sin nada guardado → defaults', async () => expect(await loadSettings(mem())).toEqual(DEFAULTS));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run tests/settings.test.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/core/settings.js`**

```js
export const DEFAULTS = { enviosUsados: 0, ivaReducido: false, unidades: 1 };

const clampInt = (v, min, max, fallback) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normalizeSettings(raw) {
  const r = raw ?? {};
  return {
    enviosUsados: clampInt(r.enviosUsados, 0, 99, DEFAULTS.enviosUsados),
    ivaReducido: r.ivaReducido === true,
    unidades: clampInt(r.unidades, 1, 99, DEFAULTS.unidades),
  };
}

export async function loadSettings(storage) {
  return normalizeSettings(await storage.get('settings'));
}

export async function saveSettings(storage, raw) {
  const s = normalizeSettings(raw);
  await storage.set('settings', s);
  return s;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run tests/settings.test.js`
Expected: PASS.

- [ ] **Step 5: Tests de `inject.js` que fallan**

`tests/inject.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildBlock, mount } from '../src/content/inject.js';

const doc = () => new DOMParser().parseFromString('<body><div id="corePrice_feature_div"></div></body>', 'text/html');
const ok = (blueArs, tarjetaArs, masBarata = 'tarjeta') => ({
  ok: true, fobUsd: 110, franquiciaAplicadaUsd: 110, arancelUsd: 0, ivaUsd: 23.1, totalUsd: 133.1,
  blueArs, tarjetaArs, masBarata, avisos: [],
});
const RATES = { blue: 1500, oficial: 1000, eurUsd: 1.1 };

describe('buildBlock', () => {
  it('muestra blue, tarjeta y marca la más barata', () => {
    const d = doc();
    const b = buildBlock(d, { results: [ok(199650, 173030)], rates: RATES, fetchedAt: Date.now() });
    expect(b.id).toBe('aar-block');
    expect(b.textContent).toMatch(/Blue/);
    expect(b.textContent).toMatch(/199\.650/);
    expect(b.textContent).toMatch(/Tarjeta/);
    expect(b.textContent).toMatch(/173\.030/);
    expect(b.textContent).toMatch(/Más barata: Tarjeta/);
    expect(b.textContent).toMatch(/Estimación, puede diferir del cargo final/);
  });

  it('rango: muestra ambos extremos', () => {
    const b = buildBlock(doc(), { results: [ok(100000, 90000), ok(200000, 180000)], rates: RATES, fetchedAt: Date.now() });
    expect(b.textContent).toMatch(/100\.000/);
    expect(b.textContent).toMatch(/200\.000/);
  });

  it('incluye el desglose con cotizaciones', () => {
    const b = buildBlock(doc(), { results: [ok(199650, 173030)], rates: RATES, fetchedAt: Date.now() });
    expect(b.querySelector('details')).not.toBeNull();
    expect(b.textContent).toMatch(/Cotizaciones/);
  });

  it('notas: cotización vieja, envío no incluido, import fees', () => {
    const b = buildBlock(doc(), {
      results: [ok(1, 2)], rates: RATES, fetchedAt: Date.now(),
      notes: [{ code: 'STALE_RATES', minutes: 12 }, { code: 'ENVIO_NO_INCLUIDO' }, { code: 'ENVIO_CON_IMPORT_FEES' }],
    });
    expect(b.textContent).toMatch(/hace 12 min/);
    expect(b.textContent).toMatch(/envío no incluido/i);
    expect(b.textContent).toMatch(/import fees/i);
  });

  it('sin cotización → mensaje explícito y ningún número', () => {
    const b = buildBlock(doc(), { error: 'NO_RATES' });
    expect(b.textContent).toMatch(/Sin cotización disponible/);
    expect(b.textContent).not.toMatch(/\$\s?\d/);
  });

  it('no interpreta HTML en las notas', () => {
    const b = buildBlock(doc(), { results: [ok(1, 2)], rates: RATES, fetchedAt: Date.now(), notes: [{ code: '<img src=x onerror=alert(1)>' }] });
    expect(b.querySelector('img')).toBeNull();
  });
});

describe('mount', () => {
  it('inserta después del ancla y es idempotente', () => {
    const d = doc();
    expect(mount(d, buildBlock(d, { error: 'NO_RATES' }))).toBe(true);
    expect(mount(d, buildBlock(d, { error: 'NO_RATES' }))).toBe(true);
    expect(d.querySelectorAll('#aar-block')).toHaveLength(1);
    expect(d.getElementById('corePrice_feature_div').nextElementSibling.id).toBe('aar-block');
  });
  it('sin ancla → false', () => {
    const d = new DOMParser().parseFromString('<body></body>', 'text/html');
    expect(mount(d, buildBlock(d, { error: 'NO_RATES' }))).toBe(false);
  });
});
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npx vitest run tests/inject.test.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 7: Implementar `src/content/inject.js`**

```js
const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const ANCHORS = '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, #apex_desktop';

const NOTE_TEXT = {
  STALE_RATES: (n) => `Cotización de hace ${n.minutes} min (no se pudo actualizar).`,
  RATES_DISCREPANCY: () => 'Las fuentes de cotización difieren más de 5 %.',
  ENVIO_NO_INCLUIDO: () => 'Envío no incluido en el cálculo.',
  ENVIO_CON_IMPORT_FEES: () => 'Amazon combina el envío con "import fees": envío no incluido para no duplicar impuestos.',
  FUERA_REGIMEN_SIMPLIFICADO: () => 'Fuera del régimen simplificado (tope USD 3.000 o más de 3 unidades): el cálculo es orientativo.',
};
const noteText = (n) => (NOTE_TEXT[n.code] ? NOTE_TEXT[n.code](n) : String(n.code));

function el(doc, tag, text, style) {
  const e = doc.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (style) e.style.cssText = style;
  return e;
}

export function buildBlock(doc, { results = [], rates, fetchedAt, notes = [], error = null }) {
  const box = el(doc, 'div', undefined, 'margin:8px 0;padding:8px 12px;border:1px solid #067d62;border-radius:8px;font-size:14px;line-height:1.4');
  box.id = 'aar-block';
  box.appendChild(el(doc, 'strong', 'Precio real en Argentina'));

  if (error) {
    box.appendChild(el(doc, 'div', 'Sin cotización disponible.'));
    return box;
  }

  const lo = results[0];
  const hi = results[results.length - 1];
  const range = (f) => (lo[f] === hi[f] ? ARS.format(lo[f]) : `${ARS.format(lo[f])} – ${ARS.format(hi[f])}`);
  box.appendChild(el(doc, 'div', `Blue: ${range('blueArs')}`));
  box.appendChild(el(doc, 'div', `Tarjeta: ${range('tarjetaArs')}`));
  const cheaper = hi.masBarata === 'blue' ? 'Blue' : 'Tarjeta';
  box.appendChild(el(doc, 'div', `Más barata: ${cheaper}`, 'font-weight:600'));

  const avisos = [...notes, ...results.flatMap((r) => r.avisos.map((code) => ({ code })))];
  for (const n of avisos) box.appendChild(el(doc, 'div', noteText(n), 'color:#b12704;font-size:12px'));

  const det = el(doc, 'details');
  det.appendChild(el(doc, 'summary', 'Ver desglose'));
  const rows = [
    ['Base (precio + envío)', USD.format(hi.fobUsd)],
    ['Franquicia aplicada', USD.format(hi.franquiciaAplicadaUsd)],
    ['Arancel', USD.format(hi.arancelUsd)],
    ['IVA', USD.format(hi.ivaUsd)],
    ['Total en USD', USD.format(hi.totalUsd)],
  ];
  for (const [k, v] of rows) det.appendChild(el(doc, 'div', `${k}: ${v}`));
  if (rates) {
    const hora = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('es-AR') : '—';
    const eur = rates.eurUsd ? `, EUR/USD ${rates.eurUsd}` : '';
    det.appendChild(el(doc, 'div', `Cotizaciones (${hora}): blue ${rates.blue}, oficial ${rates.oficial}${eur}`));
  }
  box.appendChild(det);

  box.appendChild(el(doc, 'div', 'Estimación, puede diferir del cargo final.', 'color:#565959;font-size:11px'));
  return box;
}

export function mount(doc, block) {
  doc.getElementById('aar-block')?.remove();
  const anchor = doc.querySelector(ANCHORS);
  if (!anchor) return false;
  anchor.insertAdjacentElement('afterend', block);
  return true;
}
```

- [ ] **Step 8: Correr y verificar que pasa**

Run: `npx vitest run tests/inject.test.js`
Expected: PASS (todos).

- [ ] **Step 9: Crear `src/content/run.js` y `src/content/loader.js`** (orquestación; se verifica en la Tarea 8)

`src/content/run.js`:

```js
import { parseProduct } from './parser.js';
import { buildBlock, mount } from './inject.js';
import { calc } from '../core/calc.js';
import { loadSettings } from '../core/settings.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const rules = await (await fetch(chrome.runtime.getURL('src/core/rules.json'))).json();

async function update() {
  const product = parseProduct(document, location.hostname);
  if (!product.ok) {
    document.getElementById('aar-block')?.remove();
    console.warn('[aar] sin cálculo:', product.error);
    return;
  }

  const res = await chrome.runtime.sendMessage({ type: 'GET_RATES' });
  if (!res?.ok) {
    mount(document, buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const settings = await loadSettings(storage);
  const envio = product.envio ?? 0;
  const results = [product.precio.min, product.precio.max]
    .filter((p, i, a) => i === 0 || p !== a[0])
    .map((precio) => calc({ precio, envio, moneda: product.moneda }, res.rates, settings, rules));
  if (results.some((r) => !r.ok)) {
    mount(document, buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const notes = [];
  if (res.stale) notes.push({ code: 'STALE_RATES', minutes: Math.round((Date.now() - res.fetchedAt) / 60000) });
  if (res.discrepancy) notes.push({ code: 'RATES_DISCREPANCY' });
  if (product.envioIncluyeImportFees) notes.push({ code: 'ENVIO_CON_IMPORT_FEES' });
  else if (product.envio === null) notes.push({ code: 'ENVIO_NO_INCLUIDO' });

  mount(document, buildBlock(document, { results, rates: res.rates, fetchedAt: res.fetchedAt, notes }));
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(() => update().catch((e) => console.warn('[aar]', e)), 300); };

schedule();
new MutationObserver((muts) => {
  if (muts.every((m) => m.target.closest?.('#aar-block'))) return;
  schedule();
}).observe(document.body, { childList: true, subtree: true, characterData: true });
```

`src/content/loader.js` (content script clásico; no admite `import` estático):

```js
import(chrome.runtime.getURL('src/content/run.js'));
```

- [ ] **Step 10: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src tests
git commit -m "feat: bloque en pesos, ajustes y orquestación del content script"
```

---

### Task 7: Página de opciones

**Files:**
- Create: `src/options/options.html`, `src/options/options.js`

**Interfaces:**
- Consumes: `loadSettings`, `saveSettings` (Tarea 6).
- Produces: UI con `enviosUsados` (0–99), `unidades` (1–99), `ivaReducido` (checkbox), botón Guardar; usa `chrome.storage.sync`.

La lógica de saneamiento ya está testeada en `settings.js`; esta capa es fina y se verifica en la Tarea 8.

- [ ] **Step 1: Crear `src/options/options.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Precio real Amazon Argentina</title>
  <style>
    body { font: 14px system-ui, sans-serif; min-width: 300px; padding: 12px; }
    label { display: block; margin: 10px 0; }
    input[type=number] { width: 4em; }
    small { color: #565959; }
  </style>
</head>
<body>
  <h3>Ajustes</h3>
  <label>Envíos ya usados este año (cupo de 5)
    <input id="enviosUsados" type="number" min="0" max="99">
  </label>
  <label>Unidades de la misma especie
    <input id="unidades" type="number" min="1" max="99">
  </label>
  <label><input id="ivaReducido" type="checkbox"> El producto tiene IVA reducido (10,5 %)</label>
  <button id="guardar">Guardar</button>
  <span id="estado" role="status"></span>
  <p><small>Estimación orientativa. Verificá siempre con tu courier y con ARCA.</small></p>
  <script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Crear `src/options/options.js`**

```js
import { loadSettings, saveSettings } from '../core/settings.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const $ = (id) => document.getElementById(id);

const s = await loadSettings(storage);
$('enviosUsados').value = s.enviosUsados;
$('unidades').value = s.unidades;
$('ivaReducido').checked = s.ivaReducido;

$('guardar').addEventListener('click', async () => {
  const saved = await saveSettings(storage, {
    enviosUsados: $('enviosUsados').value,
    unidades: $('unidades').value,
    ivaReducido: $('ivaReducido').checked,
  });
  $('enviosUsados').value = saved.enviosUsados;
  $('unidades').value = saved.unidades;
  $('estado').textContent = ' Guardado';
});
```

- [ ] **Step 3: Commit**

```bash
git add src/options
git commit -m "feat: página de opciones con envíos usados, unidades e IVA reducido"
```

---

### Task 8: Manifest, carga en Chromium real y fixtures reales

**Files:**
- Create: `manifest.json`, `scripts/e2e.mjs`, `tests/fixtures/real-*.html` (generados), `tests/parser.real.test.js`
- Modify: `package.json` (devDependency `playwright`), `.gitignore` (agregar `.tmp/`)

**Interfaces:**
- Consumes: todos los módulos anteriores.
- Produces: extensión cargable sin empaquetar; script `node scripts/e2e.mjs <url>...` que abre cada URL con la extensión cargada, verifica `#aar-block`, guarda captura en `.tmp/` y un fixture recortado (solo `#corePrice_feature_div` y `#mir-layout-DELIVERY_BLOCK`) en `tests/fixtures/real-<n>.html`.

Amazon detecta bots: esta verificación es manual asistida. Si aparece un captcha, resolverlo a mano en la ventana abierta y volver a correr.

- [ ] **Step 1: Crear `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Precio real Amazon Argentina",
  "version": "0.1.0",
  "description": "Muestra en Amazon el costo final en pesos argentinos (dólar blue y tarjeta) con impuestos de importación.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://dolarapi.com/*",
    "https://api.bluelytics.com.ar/*",
    "https://api.frankfurter.dev/*",
    "https://open.er-api.com/*"
  ],
  "background": { "service_worker": "src/background/worker.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://www.amazon.com/*", "https://www.amazon.es/*"],
      "js": ["src/content/loader.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": [
        "src/content/run.js",
        "src/content/parser.js",
        "src/content/inject.js",
        "src/core/calc.js",
        "src/core/settings.js",
        "src/core/rules.json"
      ],
      "matches": ["https://www.amazon.com/*", "https://www.amazon.es/*"]
    }
  ],
  "options_page": "src/options/options.html",
  "action": { "default_popup": "src/options/options.html" }
}
```

- [ ] **Step 2: Instalar Playwright y ampliar `.gitignore`**

Run: `npm install -D playwright && npx playwright install chromium`
Agregar la línea `.tmp/` a `.gitignore`.

- [ ] **Step 3: Crear `scripts/e2e.mjs`**

```js
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('Uso: node scripts/e2e.mjs <url-de-producto> [<url> ...]');
  process.exit(1);
}

const ext = path.resolve('.');
fs.mkdirSync('.tmp', { recursive: true });
fs.mkdirSync('tests/fixtures', { recursive: true });

const ctx = await chromium.launchPersistentContext(path.resolve('.tmp/profile'), {
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

let n = 0;
for (const url of urls) {
  n += 1;
  const page = await ctx.newPage();
  page.on('console', (m) => m.text().startsWith('[aar]') && console.log(`  consola: ${m.text()}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const block = await page.locator('#aar-block').first().textContent({ timeout: 2000 }).catch(() => null);
  console.log(`${block ? 'OK  ' : 'FALLA'} ${url}\n  ${block ?? 'no apareció #aar-block'}`);
  await page.screenshot({ path: `.tmp/e2e-${n}.png` });

  const fixture = await page.evaluate(() =>
    ['#corePrice_feature_div', '#mir-layout-DELIVERY_BLOCK']
      .map((s) => document.querySelector(s)?.outerHTML ?? '')
      .join('\n'),
  );
  fs.writeFileSync(`tests/fixtures/real-${n}.html`, `<body>${fixture}</body>`);
  await page.close();
}
await ctx.close();
```

- [ ] **Step 4: Verificar en navegador real**

Pedir al usuario 2 URLs de producto (una de amazon.com y una de amazon.es). Run: `node scripts/e2e.mjs <url-com> <url-es>`
Expected: ambas líneas `OK`, con montos en pesos plausibles. Revisar `.tmp/e2e-1.png` y `.tmp/e2e-2.png`.
Si alguna dice `FALLA`: leer el mensaje `[aar] sin cálculo: <ERROR>` y los fixtures generados, corregir los selectores de `parser.js` (Tarea 5) sobre el HTML real y repetir.
Verificar además con el usuario: el envío mostrado, el aviso de import fees si aparece, y que el total sea coherente con el precio de la página.

- [ ] **Step 5: Test contra los fixtures reales**

`tests/parser.real.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseProduct } from '../src/content/parser.js';

const HOSTS = { 'real-1.html': 'www.amazon.com', 'real-2.html': 'www.amazon.es' };

describe('parser con HTML real de Amazon', () => {
  for (const [file, host] of Object.entries(HOSTS)) {
    const path = new URL(`./fixtures/${file}`, import.meta.url);
    it.skipIf(!fs.existsSync(path))(`${file} (${host}) se interpreta`, () => {
      const d = new DOMParser().parseFromString(fs.readFileSync(path, 'utf8'), 'text/html');
      const r = parseProduct(d, host);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(r.precio.min).toBeGreaterThan(0);
      expect(r.moneda).toBe(host.endsWith('.es') ? 'EUR' : 'USD');
    });
  }
});
```

Run: `npm test`
Expected: PASS (los fixtures reales incluidos).

- [ ] **Step 6: Commit**

```bash
git add manifest.json scripts package.json package-lock.json .gitignore tests
git commit -m "feat: manifest MV3, script de verificación en Chromium y fixtures reales"
```

---

### Task 9: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Crear `README.md`**

````markdown
# Precio real Amazon Argentina

Extensión de Chrome/Edge que muestra, en amazon.com y amazon.es, el costo final en pesos argentinos (dólar blue y tarjeta) con los impuestos de importación por courier.

> Estimación orientativa. Las reglas están en `src/core/rules.json` y su verificación en `docs/rules-verification.md`.

## Instalación

1. `npm install` (solo necesario para correr los tests).
2. Abrí `chrome://extensions` (o `edge://extensions`) y activá **Modo desarrollador**.
3. **Cargar descomprimida** → elegí esta carpeta.

## Uso

Abrí un producto en amazon.com o amazon.es: aparece el bloque "Precio real en Argentina" debajo del precio, con blue, tarjeta, la opción más barata y un desglose desplegable.

## Ajustes

Clic en el ícono de la extensión:
- **Envíos ya usados este año:** cupo de 5 envíos por año. Al llegar a 5 se pierde la franquicia.
- **Unidades de la misma especie:** más de 3 sale del régimen simplificado.
- **IVA reducido:** actívalo solo si sabés que el producto lo tiene.

## Actualizar las reglas

Editá `src/core/rules.json` (franquicia, alícuotas, percepción de tarjeta) y recargá la extensión. Detalle de cada valor y su fuente en `docs/rules-verification.md`.

## Desarrollo

- `npm test` corre los tests (Vitest).
- `node scripts/e2e.mjs <url> [<url>...]` abre Chromium con la extensión, verifica el bloque y guarda fixtures reales. Amazon puede mostrar un captcha; resolvelo a mano.
- Si Amazon cambia su HTML, se corrige solo `src/content/parser.js` con un fixture nuevo.

## Alcance

Solo amazon.com y amazon.es, envío por courier a domicilio. Fuera de alcance: otras tiendas Amazon, casilleros, cálculo automático del cupo, detección de categoría, Firefox/Safari.
````

- [ ] **Step 2: Correr toda la suite una última vez**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README con instalación, ajustes y desarrollo"
```

---

## Self-review

**Cobertura del spec:** estructura y módulos (Tareas 1, 3–7); flujo y `MutationObserver` (6); reglas de cálculo y percepciones (3, con revisión en 2); cotizaciones con doble fuente, timeout, caché en `storage.local`, discrepancia y stale (4); parser con rangos, envío gratis/monto/ausente, import fees ignorado, no se envía, moneda inesperada (5); entradas inválidas, redondeo único, aviso de régimen simplificado (3); cupo en `storage.sync` e IVA reducido (6, 7); desglose y aviso fijo (6); pruebas unitarias, con HTML guardado y en navegador real (3–8); entrega y README (8, 9); riesgo de reglas no verificadas (2).

**Consistencia de tipos:** `CalcResult`, `getRates` (`rates/fetchedAt/stale/discrepancy`), `parseProduct` (`precio{min,max}/envio/envioIncluyeImportFees`) y los códigos de nota coinciden entre las tareas 3, 4, 5 y 6.

**Sin marcadores pendientes:** los valores desconocidos (arancel real, base de la percepción, HTML real de Amazon) se resuelven con pasos concretos en las Tareas 2 y 8, no con marcadores.
