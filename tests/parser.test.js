// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseAmount, parseProduct } from '../src/content/parser.js';

const doc = (html) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
const price = (t, extra = '') => `<span class="a-price"><span class="a-offscreen">${t}</span></span>${extra}`;
const core = (inner) => `<div id="corePrice_feature_div">${inner}</div>`;
const delivery = (t) => `<div id="mir-layout-DELIVERY_BLOCK">${t}</div>`;

describe('parseAmount', () => {
  it('formato en (amazon.com)', () => {
    expect(parseAmount('$1,299.99', 'en')).toBe(1299.99);
    expect(parseAmount('$20', 'en')).toBe(20);
  });
  it('formato es (amazon.es)', () => {
    expect(parseAmount('1.299,99 €', 'es')).toBe(1299.99);
    expect(parseAmount('12,50 €', 'es')).toBe(12.5);
    expect(parseAmount('1.299 €', 'es')).toBe(1299);
  });
  it('sin número → NaN', () => {
    expect(parseAmount('gratis', 'en')).toBeNaN();
  });
});

describe('parseProduct', () => {
  it('amazon.com: precio simple, ignora el precio tachado, envío gratis', () => {
    const d = doc(core(price('$1,299.99') + `<span class="a-price a-text-price"><span class="a-offscreen">$1,499.99</span></span>`) + delivery('FREE delivery Tuesday'));
    expect(parseProduct(d, 'www.amazon.com')).toEqual({
      ok: true, moneda: 'USD', precio: { min: 1299.99, max: 1299.99 }, envio: 0, envioIncluyeImportFees: false,
    });
  });

  it('amazon.com: envío gratis condicional (FREE + monto) → envio null, no 0', () => {
    const d = doc(core(price('$20.00')) + delivery('$12.99 delivery Tuesday. FREE delivery on orders over $49'));
    const r = parseProduct(d, 'www.amazon.com');
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(false);
  });

  it('amazon.es: envío gratis condicional (GRATIS + monto) → envio null, no 0', () => {
    const d = doc(core(price('25,00 €')) + delivery('Envío 5,99 € Entrega el martes. Envío GRATIS en pedidos superiores a 29 €'));
    const r = parseProduct(d, 'www.amazon.es');
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(false);
  });

  it('amazon.com: rango de precios', () => {
    const range = `<span class="a-price-range">${price('$20.00')}${price('$35.50')}</span>`;
    const r = parseProduct(doc(core(range) + delivery('FREE delivery')), 'www.amazon.com');
    expect(r.precio).toEqual({ min: 20, max: 35.5 });
  });

  it('amazon.es: euros con coma decimal y envío con monto', () => {
    const d = doc(core(price('1.299,99 €')) + delivery('Envío: 12,50 € Entrega el martes'));
    expect(parseProduct(d, 'www.amazon.es')).toEqual({
      ok: true, moneda: 'EUR', precio: { min: 1299.99, max: 1299.99 }, envio: 12.5, envioIncluyeImportFees: false,
    });
  });

  it('envío combinado con import fees → envio null y bandera (no duplicar impuestos)', () => {
    const d = doc(core(price('$50.00')) + delivery('$34.20 Shipping & Import Fees Deposit to Argentina'));
    const r = parseProduct(d, 'www.amazon.com');
    expect(r.ok).toBe(true);
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(true);
  });

  it('sin bloque de entrega → envio null sin bandera', () => {
    const r = parseProduct(doc(core(price('$50.00'))), 'www.amazon.com');
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(false);
  });

  it('sin precio → PRICE_NOT_FOUND', () => {
    expect(parseProduct(doc('<div>nada</div>'), 'www.amazon.com')).toEqual({ ok: false, error: 'PRICE_NOT_FOUND' });
  });

  it('moneda inesperada → UNEXPECTED_CURRENCY', () => {
    expect(parseProduct(doc(core(price('£10.00'))), 'www.amazon.com')).toEqual({ ok: false, error: 'UNEXPECTED_CURRENCY' });
  });

  it('no se envía a Argentina → NO_SHIP_TO_AR', () => {
    const d = doc(core(price('$10.00')) + delivery('This item cannot be shipped to your selected delivery location.'));
    expect(parseProduct(d, 'www.amazon.com')).toEqual({ ok: false, error: 'NO_SHIP_TO_AR' });
  });

  it('host no soportado → UNSUPPORTED_HOST', () => {
    expect(parseProduct(doc(core(price('$10.00'))), 'www.amazon.de')).toEqual({ ok: false, error: 'UNSUPPORTED_HOST' });
  });
});
