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
