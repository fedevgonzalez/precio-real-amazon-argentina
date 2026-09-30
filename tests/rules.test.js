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
    expect(rules.cache.reintentoParcialMs).toBeGreaterThan(0);
  });

  it('las alícuotas son fracciones, no porcentajes', () => {
    for (const k of ['ivaGeneral', 'ivaReducido', 'arancelGeneral', 'percepcionTarjeta']) {
      expect(rules[k], k).toBeLessThan(1);
    }
  });
});
