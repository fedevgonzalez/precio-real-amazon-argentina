// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildDetails, EMPTY_TEXT } from '../src/options/details.js';

const doc = () => new DOMParser().parseFromString('<body></body>', 'text/html');
const result = {
  ok: true, fobUsd: 110, franquiciaAplicadaUsd: 110, arancelUsd: 0, ivaUsd: 23.1, totalUsd: 133.1,
  fuente: 'estimado', blueArs: 199650, avisos: [],
};
const details = (over = {}) => ({
  moneda: 'USD', precio: { min: 100, max: 100 }, envio: 10, envioIncluyeImportFees: false,
  results: [result], rates: { blue: 1500, eurUsd: 1.1 }, fetchedAt: 1_700_000_000_000, notes: [], ...over,
});
const real = { ...result, fuente: 'amazon' };

describe('buildDetails', () => {
  it('total grande y blue, más el libro con el desglose', () => {
    const b = buildDetails(doc(), details({ results: [real] }));
    expect(b.querySelector('.total').textContent).toMatch(/USD\s?133,10/);
    expect(b.querySelector('.blue').textContent).toMatch(/Blue\s?ARS\s?199\.650/);
    const t = b.textContent;
    for (const k of ['Total + impuestos', 'Precio', 'Envío', 'Base (precio + envío)', 'Franquicia aplicada', 'Arancel estimado', 'IVA estimado']) {
      expect(t, k).toContain(k);
    }
    expect(b.querySelectorAll('.libro .fila').length).toBeGreaterThanOrEqual(6);
  });

  it('total de Amazon → fuente confirmada y sin "~"; estimación → "~" y la aclaración', () => {
    const conf = buildDetails(doc(), details({ results: [real] }));
    expect(conf.querySelector('.fuente.estimado')).toBeNull();
    expect(conf.querySelector('.fuente').textContent).toMatch(/informado por Amazon/);
    expect(conf.textContent).not.toMatch(/~/);

    const est = buildDetails(doc(), details());
    expect(est.querySelector('.fuente.estimado').textContent).toMatch(/Estimación propia/);
    expect(est.querySelector('.total').textContent).toMatch(/^~USD/);
    expect(est.querySelector('.blue .v').textContent).toMatch(/^~ARS/);
  });

  it('EUR: fila con el total en EUR entre el USD y el blue; USD: sin esa fila', () => {
    const eur = buildDetails(doc(), details({ moneda: 'EUR', precio: { min: 100, max: 100 }, results: [{ ...result, moneda: 'EUR', totalMoneda: 100 }] }));
    expect(eur.querySelector('.eur').textContent).toMatch(/Total en EUR\s?~EUR\s?100,00/);
    expect(buildDetails(doc(), details()).querySelector('.eur')).toBeNull();
  });

  it('nunca muestra tarjeta ni dólar tarjeta', () => {
    expect(buildDetails(doc(), details()).textContent).not.toMatch(/tarjeta|Tarjeta/);
  });

  it('rango de variantes: una línea con ambos extremos', () => {
    const hi = { ...result, totalUsd: 266.2, blueArs: 399300 };
    const b = buildDetails(doc(), details({ precio: { min: 100, max: 200 }, results: [result, hi] }));
    expect(b.querySelector('.total.rango').textContent).toMatch(/USD\s?133,10\s–\sUSD\s?266,20/);
    expect(b.querySelector('.blue .v').textContent).toMatch(/ARS\s?199\.650\s–\sARS\s?399\.300/);
  });

  it('envío desconocido → "no incluido"; en EUR muestra el precio en EUR', () => {
    const t = buildDetails(doc(), details({ moneda: 'EUR', precio: { min: 39.99, max: 39.99 }, envio: null })).textContent;
    expect(t).toMatch(/Envíono incluido/);
    expect(t).toMatch(/PrecioEUR 39,99/);
  });

  it('lo que cobra Amazon y su importación salen en el libro', () => {
    const t = buildDetails(doc(), details({ results: [real], amazon: { importacion: 10.61, total: 61.11 } })).textContent;
    expect(t).toMatch(/Amazon cobraUSD\s?61,11/);
    expect(t).toMatch(/importaciónUSD\s?10,61/);
    expect(buildDetails(doc(), details()).textContent).not.toMatch(/Amazon cobra/);
  });

  it('los avisos salen completos en español, una sola vez', () => {
    const r = { ...result, avisos: ['FUERA_REGIMEN_SIMPLIFICADO'] };
    const b = buildDetails(doc(), details({ results: [r, r], notes: [{ code: 'STALE_RATES', minutes: 12 }, { code: 'ENVIO_CON_IMPORT_FEES' }] }));
    const items = [...b.querySelectorAll('.avisos li')].map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/Cotización de hace 12 min/);
    expect(items.join(' ')).toMatch(/"import fees"/);
    expect(items.filter((t) => /régimen simplificado/.test(t))).toHaveLength(1);
  });

  it('sin avisos no hay lista; las tasas van en el pie', () => {
    const b = buildDetails(doc(), details({ results: [real] }));
    expect(b.querySelector('.avisos')).toBeNull();
    expect(b.querySelector('.tasas').textContent).toMatch(/Blue 1\.500 · EUR\/USD 1,1 · /);
  });

  it('una nota con HTML no crea elementos', () => {
    const b = buildDetails(doc(), details({ notes: [{ code: '<img src=x onerror=alert(1)>' }] }));
    expect(b.querySelector('img')).toBeNull();
  });

  it.each([[null], [undefined], [{ results: [] }]])('sin datos (%j) → texto de estado vacío', (d) => {
    expect(buildDetails(doc(), d).textContent).toBe(EMPTY_TEXT);
  });
});
