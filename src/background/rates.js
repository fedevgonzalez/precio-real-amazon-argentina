export const SOURCES = {
  blue: [
    { url: 'https://dolarapi.com/v1/dolares/blue', pick: (j) => j?.venta },
    { url: 'https://api.bluelytics.com.ar/v2/latest', pick: (j) => j?.blue?.value_sell },
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
  const names = ['blue', 'eurUsd'];
  // Timestamp por tasa; una caché vieja (solo fetchedAt) cuenta como si todas fueran de fetchedAt.
  const cachedAt = (n) => cached?.ratesAt?.[n] ?? (cached?.rates?.[n] ? cached.fetchedAt : undefined);

  // Vigente solo si está completa: sin eurUsd hay que reintentar (amazon.es quedaría sin conversión todo el TTL).
  const completa = () => names.every((n) => cached?.rates?.[n]);
  if (completa() && now() - cachedAt('blue') < ttl) {
    const ratesAt = Object.fromEntries(names.map((n) => [n, cachedAt(n)]));
    // Una tasa puntual puede ser más vieja que el TTL (su fuente viene cayendo): se reporta como reusada.
    const staleRates = names.filter((n) => now() - cachedAt(n) >= ttl);
    return {
      ok: true, rates: cached.rates, ratesAt, staleRates,
      fetchedAt: ratesAt.blue,
      stale: staleRates.some((n) => n !== 'eurUsd'),
      discrepancy: !!cached.discrepancy,
    };
  }

  // Caché incompleta que ya se intentó completar hace poco: responder con lo cacheado
  // sin volver a martillar las 6 consultas por cada GET_RATES (fuentes caídas).
  if (cached && !completa() && now() - (cached.lastAttemptAt ?? 0) < rules.cache.reintentoParcialMs) {
    if (!cached.rates?.blue) return { ok: false, error: 'NO_RATES' };
    const ratesAt = Object.fromEntries(names.filter((n) => cached.rates[n]).map((n) => [n, cachedAt(n)]));
    const staleRates = names.filter((n) => cached.rates[n] && now() - cachedAt(n) >= ttl);
    return {
      ok: true, rates: cached.rates, ratesAt, staleRates,
      fetchedAt: ratesAt.blue,
      stale: staleRates.some((n) => n !== 'eurUsd'),
      discrepancy: !!cached.discrepancy,
    };
  }

  const fresh = await Promise.all(names.map((n) => resolveRate(n, fetchFn, rules)));

  const rates = {};
  const ratesAt = {};
  const staleRates = [];
  let discrepancy = false;
  names.forEach((n, i) => {
    if (fresh[i]) {
      rates[n] = fresh[i].value;
      ratesAt[n] = now();
      discrepancy ||= fresh[i].discrepancy;
    } else if (cached?.rates?.[n]) {
      rates[n] = cached.rates[n];
      ratesAt[n] = cachedAt(n); // una tasa reusada conserva SU timestamp original
      staleRates.push(n);
    }
  });

  if (!rates.blue) return { ok: false, error: 'NO_RATES' };

  const stale = staleRates.some((n) => n !== 'eurUsd');
  if (staleRates.length) discrepancy ||= !!cached.discrepancy;
  const fetchedAt = ratesAt.blue;
  await storage.set('rates', { rates, ratesAt, fetchedAt, discrepancy, lastAttemptAt: now() });
  return { ok: true, rates, ratesAt, fetchedAt, stale, staleRates, discrepancy };
}
