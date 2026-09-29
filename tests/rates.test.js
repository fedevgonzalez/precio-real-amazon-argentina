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
