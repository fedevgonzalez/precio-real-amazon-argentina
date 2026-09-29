// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildBlock, mount } from '../src/content/inject.js';

const doc = () => new DOMParser().parseFromString('<body><div id="corePrice_feature_div"></div></body>', 'text/html');
const ok = (blueArs, tarjetaArs, masBarata = 'tarjeta') => ({
  ok: true, fobUsd: 110, franquiciaAplicadaUsd: 110, arancelUsd: 0, ivaUsd: 23.1, totalUsd: 133.1, pagoAmazonUsd: 110, aduanaArs: 23100,
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

  it('deduplica avisos repetidos entre resultados del rango', () => {
    const lo = ok(100000, 90000); lo.avisos = ['FUERA_REGIMEN_SIMPLIFICADO'];
    const hi = ok(200000, 180000); hi.avisos = ['FUERA_REGIMEN_SIMPLIFICADO'];
    const b = buildBlock(doc(), { results: [lo, hi], rates: RATES, fetchedAt: Date.now() });
    expect(b.textContent.match(/Fuera del régimen simplificado/g)).toHaveLength(1);
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
