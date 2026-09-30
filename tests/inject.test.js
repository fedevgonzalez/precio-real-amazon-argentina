// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildBlock, mount, renderSignature } from '../src/content/inject.js';

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

  it('montos en pesos con código ARS, no con $ (convive con USD $)', () => {
    const b = buildBlock(doc(), { results: [ok(199650, 173030)], rates: RATES, fetchedAt: Date.now() });
    expect(b.textContent).toMatch(/ARS\s?199\.650/); // pesos: "ARS 199.650"
    expect(b.textContent).toMatch(/ARS\s?173\.030/);
    expect(b.textContent).not.toMatch(/\$\s?199\.650/); // nunca "$ 199.650" junto al "US$ 110,00" del desglose
    expect(b.textContent).toMatch(/US\$\s?110,00/); // el desglose en USD sigue con $
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

  it('NO_SHIP_TO_AR → "No se envía a Argentina." sin números', () => {
    const b = buildBlock(doc(), { error: 'NO_SHIP_TO_AR' });
    expect(b.textContent).toMatch(/No se envía a Argentina\./);
    expect(b.textContent).not.toMatch(/\d/);
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

  it('al remontar conserva el desglose abierto (y cerrado se conserva cerrado)', () => {
    const d = doc();
    const build = (blue) => buildBlock(d, { results: [ok(blue, blue)], rates: RATES, fetchedAt: Date.now() });
    mount(d, build(199650));
    d.querySelector('#aar-block details').open = true;
    mount(d, build(200000)); // números nuevos → remonte real
    expect(d.querySelector('#aar-block details').open).toBe(true);
    d.querySelector('#aar-block details').open = false;
    mount(d, build(210000));
    expect(d.querySelector('#aar-block details').open).toBe(false);
  });
});

describe('renderSignature', () => {
  const product = { precio: { min: 100, max: 120 }, envio: 10, envioIncluyeImportFees: false, moneda: 'USD' };
  const settings = { enviosUsados: 0, ivaReducido: false, unidades: 1 };
  const base = {
    product, rates: RATES, settings,
    stale: false, discrepancy: false, fetchedAt: 1_700_000_000_000,
    notes: [{ code: 'ENVIO_NO_INCLUIDO' }],
  };

  it('idéntica si nada cambió; fetchedAt dentro del mismo minuto no cuenta como cambio', () => {
    expect(renderSignature({ ...base })).toBe(renderSignature({ ...base }));
    expect(renderSignature({ ...base, fetchedAt: 1_700_000_005_000 })).toBe(renderSignature(base));
  });

  it('cambia si cambia precio, tasa, settings, stale/discrepancy, minuto o notas', () => {
    const sig = renderSignature(base);
    expect(renderSignature({ ...base, product: { ...product, precio: { min: 101, max: 120 } } })).not.toBe(sig);
    expect(renderSignature({ ...base, rates: { ...RATES, blue: 1501 } })).not.toBe(sig);
    expect(renderSignature({ ...base, settings: { ...settings, ivaReducido: true } })).not.toBe(sig);
    expect(renderSignature({ ...base, stale: true })).not.toBe(sig);
    expect(renderSignature({ ...base, discrepancy: true })).not.toBe(sig);
    expect(renderSignature({ ...base, fetchedAt: 1_700_000_060_001 })).not.toBe(sig); // otro minuto
    expect(renderSignature({ ...base, notes: [] })).not.toBe(sig);
  });
});
