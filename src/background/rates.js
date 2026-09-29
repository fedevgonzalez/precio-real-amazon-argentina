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
