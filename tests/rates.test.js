import { describe, it, expect, vi } from 'vitest';
import { getRates, SOURCES } from '../src/background/rates.js';
import { RULES } from './fixtures/test-rules.js';

const U = {
  blue1: SOURCES.blue[0].url, blue2: SOURCES.blue[1].url,
  eur1: SOURCES.eurUsd[0].url, eur2: SOURCES.eurUsd[1].url,
};
const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
const HAPPY = {
  [U.blue1]: okJson({ venta: 1500 }),
  [U.blue2]: okJson({ blue: { value_sell: 1510 },  }),
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
    expect(r.rates).toEqual({ blue: 1500, eurUsd: 1.1 });
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
    const map = { ...HAPPY, [U.blue2]: okJson({ blue: { value_sell: 1700 },  }) };
    const r = await getRates(ctx(makeFetch(map), makeStorage()));
    expect(r.ok).toBe(true);
    expect(r.discrepancy).toBe(true);
  });

  it('caché vigente: no consulta la red', async () => {
    const cached = { rates: { blue: 1400, eurUsd: 1.05 }, fetchedAt: 1_000_000 - 60_000, discrepancy: false };
    const fetchFn = makeFetch(HAPPY);
    const r = await getRates(ctx(fetchFn, makeStorage({ rates: cached })));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, stale: false });
    expect(r.rates.blue).toBe(1400);
  });

  it('todo caído con caché vencido → devuelve lo cacheado como stale', async () => {
    const cached = { rates: { blue: 1400, eurUsd: 1.05 }, fetchedAt: 1_000_000 - 3_600_000, discrepancy: false };
    const r = await getRates(ctx(makeFetch({}), makeStorage({ rates: cached })));
    expect(r).toMatchObject({ ok: true, stale: true, fetchedAt: cached.fetchedAt });
    expect(r.rates.blue).toBe(1400);
  });

  it('todo caído y sin caché → NO_RATES', async () => {
    expect(await getRates(ctx(makeFetch({}), makeStorage()))).toEqual({ ok: false, error: 'NO_RATES' });
  });

  it('eurUsd caído pero blue ok → sigue funcionando para USD', async () => {
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

  it('caché vigente sin eurUsd: reconsulta la red y completa eurUsd', async () => {
    const cached = { rates: { blue: 1400 }, fetchedAt: 1_000_000 - 60_000, discrepancy: false };
    const fetchFn = makeFetch(HAPPY);
    const storage = makeStorage({ rates: cached });
    const r = await getRates(ctx(fetchFn, storage));
    expect(fetchFn).toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, stale: false, fetchedAt: 1_000_000 });
    expect(r.rates).toEqual({ blue: 1500, eurUsd: 1.1 });
    expect(storage._m.get('rates').rates.eurUsd).toBe(1.1);
  });

  it('blue fresco + eurUsd de caché vencida: stale false y fetchedAt fresco', async () => {
    const cached = { rates: { blue: 1400, eurUsd: 1.05 }, fetchedAt: 1_000_000 - 3_600_000, discrepancy: false };
    const map = { ...HAPPY };
    delete map[U.eur1]; delete map[U.eur2];
    const r = await getRates(ctx(makeFetch(map), makeStorage({ rates: cached })));
    expect(r).toMatchObject({ ok: true, stale: false, fetchedAt: 1_000_000 });
    expect(r.rates).toEqual({ blue: 1500, eurUsd: 1.05 });
  });

  it('discrepancy cacheada se conserva al reusar un valor de la caché', async () => {
    const cached = { rates: { blue: 1400, eurUsd: 1.05 }, fetchedAt: 1_000_000 - 3_600_000, discrepancy: true };
    const map = { ...HAPPY };
    delete map[U.eur1]; delete map[U.eur2];
    const r = await getRates(ctx(makeFetch(map), makeStorage({ rates: cached })));
    expect(r.ok).toBe(true);
    expect(r.discrepancy).toBe(true);
  });

  it('tasa reusada de caché conserva SU timestamp original (ratesAt) y figura en staleRates', async () => {
    const t0 = 1_000_000 - 86_400_000; // eurUsd de ayer, blue vencido
    const cached = { rates: { blue: 1400, eurUsd: 1.05 }, fetchedAt: t0, discrepancy: false };
    const map = { ...HAPPY };
    delete map[U.eur1]; delete map[U.eur2];
    const storage = makeStorage({ rates: cached });
    const r = await getRates(ctx(makeFetch(map), storage));
    expect(r.ok).toBe(true);
    expect(r.staleRates).toEqual(['eurUsd']);
    expect(r.stale).toBe(false);
    expect(r.ratesAt).toEqual({ blue: 1_000_000, eurUsd: t0 });
    expect(r.fetchedAt).toBe(1_000_000); // el más viejo entre blue (fresco)
    // Lo guardado conserva el timestamp original del eurUsd, no el del render.
    expect(storage._m.get('rates').ratesAt.eurUsd).toBe(t0);
  });

  it('eurUsd viejo en caché vigente: no se refresca ni se sirve como fresco en llamadas repetidas', async () => {
    // Caché como queda tras el test anterior: blue fresco, eurUsd reusado y viejo.
    const t0 = 1_000_000 - 86_400_000;
    const cached = {
      rates: { blue: 1500, eurUsd: 1.05 },
      ratesAt: { blue: 1_000_000, eurUsd: t0 },
      fetchedAt: 1_000_000, discrepancy: false,
    };
    const fetchFn = makeFetch(HAPPY);
    const r = await getRates(ctx(fetchFn, makeStorage({ rates: cached })));
    expect(fetchFn).not.toHaveBeenCalled(); // caché vigente: ni un fetch
    expect(r.staleRates).toEqual(['eurUsd']); // sigue reportado como reusado
    expect(r.ratesAt.eurUsd).toBe(t0); // y con su timestamp original
    expect(r.stale).toBe(false);
  });

  it('caché incompleta con intento reciente: no consulta la red (backoff de reintentoParcialMs)', async () => {
    const map = { ...HAPPY };
    delete map[U.eur1]; delete map[U.eur2];
    const fetchFn = makeFetch(map);
    const storage = makeStorage();
    let t = 1_000_000;
    // 5 llamadas seguidas con eurUsd caído: una sola ronda de fetches (6 consultas).
    for (let i = 0; i < 5; i++) await getRates({ fetchFn, storage, rules: RULES, now: () => t });
    expect(fetchFn).toHaveBeenCalledTimes(4);
    // Pasado reintentoParcialMs (1000 en el fixture) se reintenta la red.
    t = 1_000_000 + 1_001;
    await getRates({ fetchFn, storage, rules: RULES, now: () => t });
    expect(fetchFn).toHaveBeenCalledTimes(8);
  });
});
