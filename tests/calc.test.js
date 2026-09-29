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
    expect(r.pagoAmazonUsd).toBeCloseTo(110);
    expect(r.aduanaArs).toBe(23100);
    expect(r.blueArs).toBe(188100);
    expect(r.tarjetaArs).toBe(166100);
    expect(r.masBarata).toBe('tarjeta');
    expect(r.avisos).toEqual([]);
  });

  it('justo en USD 400: sin arancel', () => {
    const r = run({ precio: 400, moneda: 'USD' });
    expect(r.arancelUsd).toBe(0);
    expect(r.ivaUsd).toBeCloseTo(84);
    expect(r.totalUsd).toBeCloseTo(484);
    expect(r.blueArs).toBe(684000);
    expect(r.tarjetaArs).toBe(604000);
  });

  it('excedente sobre USD 400 paga arancel e IVA sobre (fob + arancel)', () => {
    const r = run({ precio: 500, moneda: 'USD' });
    expect(r.franquiciaAplicadaUsd).toBe(400);
    expect(r.arancelUsd).toBeCloseTo(35);
    expect(r.ivaUsd).toBeCloseTo(112.35);
    expect(r.totalUsd).toBeCloseTo(647.35);
    expect(r.aduanaArs).toBe(147350);
    expect(r.blueArs).toBe(897350);
    expect(r.tarjetaArs).toBe(797350);
  });

  it('cupo agotado: régimen general sobre el total', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { enviosUsados: 5 });
    expect(r.franquiciaAplicadaUsd).toBe(0);
    expect(r.arancelUsd).toBeCloseTo(35);
    expect(r.ivaUsd).toBeCloseTo(28.35);
    expect(r.totalUsd).toBeCloseTo(163.35);
    expect(r.aduanaArs).toBe(63350);
    expect(r.blueArs).toBe(213350);
    expect(r.tarjetaArs).toBe(193350);
  });

  it('con 4 envíos usados todavía hay cupo', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { enviosUsados: 4 });
    expect(r.franquiciaAplicadaUsd).toBe(100);
  });

  it('EUR se convierte con eurUsd', () => {
    const r = run({ precio: 100, envio: 0, moneda: 'EUR' });
    expect(r.fobUsd).toBeCloseTo(110);
    expect(r.totalUsd).toBeCloseTo(133.1);
    expect(r.blueArs).toBe(188100);
    expect(r.tarjetaArs).toBe(166100);
  });

  it('IVA reducido', () => {
    const r = run({ precio: 100, moneda: 'USD' }, { ivaReducido: true });
    expect(r.ivaUsd).toBeCloseTo(10.5);
    expect(r.totalUsd).toBeCloseTo(110.5);
    expect(r.aduanaArs).toBe(10500);
    expect(r.blueArs).toBe(160500);
    expect(r.tarjetaArs).toBe(140500);
  });

  it('marca blue como más barata cuando corresponde', () => {
    const r = run({ precio: 100, envio: 10, moneda: 'USD' }, {}, { ...RATES, blue: 1200 });
    expect(r.blueArs).toBe(155100);
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
});
