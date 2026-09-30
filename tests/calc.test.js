import { describe, it, expect } from 'vitest';
import { calc } from '../src/core/calc.js';
import { RULES } from './fixtures/test-rules.js';

const RATES = { blue: 1500, oficial: 1000, eurUsd: 1.1 };
const S = { enviosUsados: 0, ivaReducido: false, unidades: 1 };
const run = (item, settings = {}, rates = RATES) => calc(item, rates, { ...S, ...settings }, RULES);

describe('calc', () => {
  it('dentro de franquicia: solo IVA', () => {
    const r = run({ precio: 100, envio: 10, moneda: 'USD' });
    expect(r.ok).toBe(true);
    expect(r.fobUsd).toBeCloseTo(110);
    expect(r.franquiciaAplicadaUsd).toBeCloseTo(110);
    expect(r.arancelUsd).toBe(0);
    expect(r.ivaUsd).toBeCloseTo(23.1);
    expect(r.totalUsd).toBeCloseTo(133.1);
    expect(r.fuente).toBe('estimado');
    expect(r.blueArs).toBe(199650);
    expect(r.tarjetaArs).toBe(173030);
    expect(r.masBarata).toBe('tarjeta');
    expect(r.avisos).toEqual([]);
  });

  it('justo en USD 400: sin arancel', () => {
    const r = run({ precio: 400, moneda: 'USD' });
    expect(r.arancelUsd).toBe(0);
    expect(r.ivaUsd).toBeCloseTo(84);
    expect(r.totalUsd).toBeCloseTo(484);
    expect(r.blueArs).toBe(726000);
    expect(r.tarjetaArs).toBe(629200);
  });

  it('excedente sobre USD 400 paga arancel e IVA sobre (fob + arancel)', () => {
    const r = run({ precio: 500, moneda: 'USD' });
    expect(r.franquiciaAplicadaUsd).toBe(400);
    expect(r.arancelUsd).toBeCloseTo(35);
    expect(r.ivaUsd).toBeCloseTo(112.35);
    expect(r.totalUsd).toBeCloseTo(647.35);
    expect(r.blueArs).toBe(971025);
    expect(r.tarjetaArs).toBe(841555);
  });

  it('cupo agotado: régimen general sobre el total', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { enviosUsados: 5 });
    expect(r.franquiciaAplicadaUsd).toBe(0);
    expect(r.arancelUsd).toBeCloseTo(35);
    expect(r.ivaUsd).toBeCloseTo(28.35);
    expect(r.totalUsd).toBeCloseTo(163.35);
    expect(r.blueArs).toBe(245025);
    expect(r.tarjetaArs).toBe(212355);
  });

  it('con 4 envíos usados todavía hay cupo', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { enviosUsados: 4 });
    expect(r.franquiciaAplicadaUsd).toBe(100);
  });

  it('EUR: se descuenta el IVA de España (precio ÷ 1,21) y se convierte con eurUsd', () => {
    const r = run({ precio: 100, envio: 0, moneda: 'EUR' });
    expect(r.fobUsd).toBeCloseTo(100 / 1.21 * 1.1);
    expect(r.totalUsd).toBeCloseTo(110); // (100 ÷ 1,21) × 1,21 = 100 EUR → × 1,1
    expect(r.blueArs).toBe(165000);
    expect(r.tarjetaArs).toBe(143000);
  });

  it('expone el total en la moneda del producto (EUR) además del USD', () => {
    const eur = run({ precio: 100, envio: 0, moneda: 'EUR' });
    expect(eur.moneda).toBe('EUR');
    expect(eur.totalMoneda).toBeCloseTo(100); // (100 ÷ 1,21) × 1,21 EUR
    expect(eur.totalUsd).toBeCloseTo(110);
    const usd = run({ precio: 100, envio: 0, moneda: 'USD' });
    expect(usd.totalMoneda).toBeCloseTo(usd.totalUsd);
  });

  it('EUR contra dos checkouts reales de amazon.es (Importe total)', () => {
    const eur = { blue: 1500, oficial: 1000, eurUsd: 1 };
    const total = (precio, envio) => calc({ precio, envio, moneda: 'EUR' }, eur, S, RULES).totalUsd;
    expect(total(39.99, 30.5)).toBeCloseTo(76.9, 1); // checkout: 33,05 + 30,50 + 13,35 = 76,90 €
    expect(Math.abs(total(89.99, 30.33) / 126.16 - 1)).toBeLessThan(0.01); // checkout: 74,37 + 30,33 + 21,46 = 126,16 € (estimación +0,4 %)
  });

  it('IVA reducido', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { ivaReducido: true });
    expect(r.ivaUsd).toBeCloseTo(10.5);
    expect(r.totalUsd).toBeCloseTo(110.5);
    expect(r.blueArs).toBe(165750);
    expect(r.tarjetaArs).toBe(143650);
  });

  it('marca blue como más barata cuando corresponde', () => {
    const r = run({ precio: 100, envio: 10, moneda: 'USD' }, {}, { ...RATES, blue: 1200 });
    expect(r.blueArs).toBe(159720);
    expect(r.masBarata).toBe('blue');
  });

  it.each([
    [{ precio: 0, moneda: 'USD' }],
    [{ precio: NaN, moneda: 'USD' }],
    [{ precio: -5, moneda: 'USD' }],
    [{ precio: 10, envio: -1, moneda: 'USD' }],
    [{ precio: 10, moneda: 'GBP' }],
    [undefined],
  ])('entrada inválida %j → INVALID_INPUT', (item) => {
    expect(run(item)).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('sin cotizaciones → NO_RATES', () => {
    expect(run({ precio: 10, moneda: 'USD' }, {}, { blue: 0, oficial: 1000 })).toEqual({ ok: false, error: 'NO_RATES' });
    expect(run({ precio: 10, moneda: 'EUR' }, {}, { blue: 1500, oficial: 1000 })).toEqual({ ok: false, error: 'NO_RATES' });
  });

  it('USD no necesita eurUsd', () => {
    expect(run({ precio: 10, moneda: 'USD' }, {}, { blue: 1500, oficial: 1000 }).ok).toBe(true);
  });

  it('avisa si sale del régimen simplificado', () => {
    expect(run({ precio: 3500, moneda: 'USD' }).avisos).toContain('FUERA_REGIMEN_SIMPLIFICADO');
    expect(run({ precio: 100, moneda: 'USD' }, { unidades: 4 }).avisos).toContain('FUERA_REGIMEN_SIMPLIFICADO');
  });

  it('si la página informa el total de Amazon (USD), se usa ese y no la estimación propia', () => {
    const r = run({ precio: 119.99, moneda: 'USD', amazonTotal: 150.74 });
    expect(r.fuente).toBe('amazon');
    expect(r.totalUsd).toBeCloseTo(150.74);
    expect(r.blueArs).toBe(226110); // 150,74 × 1500
    expect(r.tarjetaArs).toBe(195962); // 150,74 × 1000 × 1,3
  });

  it('total de Amazon en EUR se convierte con eurUsd; valores inválidos lo ignoran', () => {
    expect(run({ precio: 33.05, envio: 30.5, moneda: 'EUR', amazonTotal: 76.9 }).totalUsd).toBeCloseTo(84.59);
    for (const amazonTotal of [null, undefined, 0, -5, NaN]) {
      expect(run({ precio: 100, moneda: 'USD', amazonTotal }).fuente).toBe('estimado');
    }
  });
});
