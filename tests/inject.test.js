// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildBlock, mount, renderSignature } from '../src/content/inject.js';

const doc = () => new DOMParser().parseFromString('<body><div id="corePrice_feature_div"></div></body>', 'text/html');
const ok = (blueArs, tarjetaArs, masBarata = 'tarjeta') => ({
  ok: true, fobUsd: 110, franquiciaAplicadaUsd: 110, arancelUsd: 0, ivaUsd: 23.1, totalUsd: 133.1, pagoAmazonUsd: 110, aduanaArs: 23100,
  blueArs, tarjetaArs, masBarata, avisos: [],
});
const RATES = { blue: 1500, oficial: 1000, eurUsd: 1.1 };

describe('buildBlock (bloque mínimo)', () => {
  it('muestra solo total + impuestos en USD y blue en ARS', () => {
    const b = buildBlock(doc(), { results: [ok(199650, 173030)] });
    expect(b.id).toBe('aar-block');
    expect(b.textContent).toMatch(/Precio real en Argentina/);
    expect(b.textContent).toMatch(/Total \+ impuestos: USD\s?133,10/);
    expect(b.textContent).toMatch(/Blue: ARS\s?199\.650/);
  });

  it('nunca muestra tarjeta, "más barata", desglose ni el aviso fijo', () => {
    const b = buildBlock(doc(), { results: [ok(199650, 173030)], notes: [{ code: 'ENVIO_NO_INCLUIDO' }] });
    expect(b.textContent).not.toMatch(/Tarjeta|tarjeta|Más barata|desglose|Estimación|173\.030/);
    expect(b.querySelector('details')).toBeNull();
  });

  it('sin notas no hay línea ⚠', () => {
    const b = buildBlock(doc(), { results: [ok(1, 2)] });
    expect(b.textContent).not.toMatch(/⚠/);
  });

  it.each([
    [{ code: 'STALE_RATES', minutes: 12 }],
    [{ code: 'RATES_DISCREPANCY' }],
    [{ code: 'ENVIO_NO_INCLUIDO' }],
    [{ code: 'ENVIO_CON_IMPORT_FEES' }],
  ])('con la nota %j aparece una sola línea "⚠ Ver detalle en la extensión"', (note) => {
    const b = buildBlock(doc(), { results: [ok(1, 2)], notes: [note, { code: 'ENVIO_NO_INCLUIDO' }] });
    expect(b.textContent.match(/⚠ Ver detalle en la extensión/g)).toHaveLength(1);
  });

  it('un aviso de calc (fuera del régimen) también marca ⚠', () => {
    const r = ok(1, 2); r.avisos = ['FUERA_REGIMEN_SIMPLIFICADO'];
    expect(buildBlock(doc(), { results: [r] }).textContent).toMatch(/⚠ Ver detalle en la extensión/);
  });

  it('rango: muestra ambos extremos de USD y de ARS', () => {
    const lo = ok(100000, 90000); lo.totalUsd = 50;
    const hi = ok(200000, 180000); hi.totalUsd = 100;
    const b = buildBlock(doc(), { results: [lo, hi] });
    expect(b.textContent).toMatch(/USD\s?50,00\s–\sUSD\s?100,00/);
    expect(b.textContent).toMatch(/ARS\s?100\.000\s–\sARS\s?200\.000/);
  });

  it('pesos con código ARS, nunca con $', () => {
    const b = buildBlock(doc(), { results: [ok(199650, 173030)] });
    expect(b.textContent).not.toMatch(/\$\s?199\.650/);
  });

  it('sin cotización → mensaje explícito y ningún número', () => {
    const b = buildBlock(doc(), { error: 'NO_RATES' });
    expect(b.textContent).toMatch(/Sin cotización disponible/);
    expect(b.textContent).not.toMatch(/\d/);
  });

  it('NO_SHIP_TO_AR → "No se envía a Argentina." sin números', () => {
    const b = buildBlock(doc(), { error: 'NO_SHIP_TO_AR' });
    expect(b.textContent).toMatch(/No se envía a Argentina\./);
    expect(b.textContent).not.toMatch(/\d/);
  });

  it('RELOAD → pide recargar la página', () => {
    expect(buildBlock(doc(), { error: 'RELOAD' }).textContent).toMatch(/Recargá la página/);
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
