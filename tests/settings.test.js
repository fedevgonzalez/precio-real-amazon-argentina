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
