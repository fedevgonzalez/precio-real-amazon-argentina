// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildDetails, EMPTY_TEXT } from '../src/options/details.js';

const doc = () => new DOMParser().parseFromString('<body></body>', 'text/html');
const result = {
  ok: true, fobUsd: 110, franquiciaAplicadaUsd: 110, arancelUsd: 0, ivaUsd: 23.1, totalUsd: 133.1,
  pagoAmazonUsd: 110, aduanaArs: 23100, blueArs: 188100, tarjetaArs: 166100, masBarata: 'tarjeta', avisos: [],
};
const details = (over = {}) => ({
  moneda: 'USD', precio: { min: 100, max: 100 }, envio: 10, envioIncluyeImportFees: false,
  results: [result], rates: { blue: 1500, oficial: 1000, eurUsd: 1.1 }, fetchedAt: 1_700_000_000_000, notes: [], ...over,
});

describe('buildDetails', () => {
  it('muestra el desglose completo y el blue', () => {
    const t = buildDetails(doc(), details()).textContent;
    for (const k of ['Producto actual', 'Base (precio + envío)', 'Franquicia aplicada', 'Arancel', 'IVA', 'Total + impuestos',
      'Pago a Amazon', 'Tributos de aduana', 'Blue', 'Cotizaciones', 'Estimación, puede diferir del cargo final']) {
      expect(t, k).toContain(k);
    }
    expect(t).toMatch(/Total \+ impuestos: USD\s?133,10/);
    expect(t).toMatch(/Blue: ARS\s?188\.100/);
  });

  it('nunca muestra tarjeta ni dólar tarjeta', () => {
    const t = buildDetails(doc(), details()).textContent;
    expect(t).not.toMatch(/tarjeta|Tarjeta|166\.100/);
  });

  it('envío desconocido → "no incluido"; en EUR muestra el precio en EUR', () => {
    const t = buildDetails(doc(), details({ moneda: 'EUR', precio: { min: 39.99, max: 39.99 }, envio: null })).textContent;
    expect(t).toMatch(/Envío: no incluido/);
    expect(t).toMatch(/Precio: EUR 39,99/);
  });

  it('las notas salen completas en español, una sola vez, con ⚠', () => {
    const r = { ...result, avisos: ['FUERA_REGIMEN_SIMPLIFICADO'] };
    const t = buildDetails(doc(), details({
      results: [r, r],
      notes: [{ code: 'STALE_RATES', minutes: 12 }, { code: 'ENVIO_CON_IMPORT_FEES' }],
    })).textContent;
    expect(t).toMatch(/⚠ Cotización de hace 12 min/);
    expect(t).toMatch(/⚠ Amazon combina el envío con "import fees"/);
    expect(t.match(/Fuera del régimen simplificado/g)).toHaveLength(1);
  });

  it('una nota con HTML no crea elementos', () => {
    const b = buildDetails(doc(), details({ notes: [{ code: '<img src=x onerror=alert(1)>' }] }));
    expect(b.querySelector('img')).toBeNull();
  });

  it.each([[null], [undefined], [{ results: [] }]])('sin datos (%j) → texto de estado vacío', (d) => {
    expect(buildDetails(doc(), d).textContent).toBe(EMPTY_TEXT);
  });
});
