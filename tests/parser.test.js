// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseAmount, parseProduct, parseSearchCards, amazonTotalFromHtml } from '../src/content/parser.js';

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

describe('parseSearchCards (página de resultados)', () => {
  const card = (asin, inner) => `<div data-component-type="s-search-result" data-asin="${asin}">${inner}</div>`;
  const priceRecipe = (inner) => `<div data-cy="price-recipe">${inner}</div>`;
  const delivery = (t) => `<div data-cy="delivery-recipe">${t}</div>`;
  const search = (...cards) => doc(cards.join(''));

  it('lee precio (ignorando el tachado) y entrega gratis sin monto → envío 0', () => {
    const d = search(card('A1', priceRecipe(price('US$119.99', '<span class="a-price a-text-price"><span class="a-offscreen">US$149.99</span></span>')) + delivery('Entrega GRATIS el lun, 12 de oct a Argentina')));
    const [c] = parseSearchCards(d, 'www.amazon.com');
    expect(c.card.getAttribute('data-asin')).toBe('A1');
    expect(c.product).toEqual({ ok: true, moneda: 'USD', precio: { min: 119.99, max: 119.99 }, envio: 0, envioIncluyeImportFees: false });
  });

  it('miles con coma en amazon.com (US$3,499.99) y envío real ("Entrega por US$31.27")', () => {
    const d = search(
      card('A2', priceRecipe(price('US$3,499.99')) + delivery('Entrega GRATISSe envía a Argentina')),
      card('A3', priceRecipe(price('US$34.56')) + delivery('Entrega por US$31.27 el jue, 8 de octSe envía a Argentina')),
    );
    const [a, b] = parseSearchCards(d, 'www.amazon.com');
    expect(a.product.precio.min).toBe(3499.99);
    expect(a.product.envio).toBe(0);
    expect(b.product.envio).toBe(31.27);
  });

  it('gratis condicionado a un monto ("en US$99 de artículos elegibles") → envío desconocido (null)', () => {
    const d = search(card('A4', priceRecipe(price('US$39.99')) + delivery('Entrega GRATIS el jue, 8 de oct a Argentina en US$99 de artículos elegibles')));
    expect(parseSearchCards(d, 'www.amazon.com')[0].product.envio).toBeNull();
  });

  it('rango de precios dentro de la tarjeta', () => {
    const range = `<span class="a-price-range">${price('US$20.00')}${price('US$35.50')}</span>`;
    const d = search(card('A5', priceRecipe(range) + delivery('Entrega GRATIS')));
    expect(parseSearchCards(d, 'www.amazon.com')[0].product.precio).toEqual({ min: 20, max: 35.5 });
  });

  it('tarjeta sin precio (agotado / sin oferta) → PRICE_NOT_FOUND; las demás siguen bien', () => {
    const d = search(card('A6', '<div data-cy="title-recipe">Agotado</div>'), card('A7', priceRecipe(price('US$10.00')) + delivery('Entrega GRATIS')));
    const [a, b] = parseSearchCards(d, 'www.amazon.com');
    expect(a.product).toEqual({ ok: false, error: 'PRICE_NOT_FOUND' });
    expect(b.product.ok).toBe(true);
  });

  it('amazon.es: euros con coma decimal', () => {
    const d = search(card('A8', priceRecipe(price('39,99 €')) + delivery('Envío: 30,50 € Entrega el lunes')));
    const [c] = parseSearchCards(d, 'www.amazon.es');
    expect(c.product).toMatchObject({ ok: true, moneda: 'EUR', precio: { min: 39.99, max: 39.99 }, envio: 30.5 });
  });

  it('moneda inesperada y host no soportado', () => {
    const d = search(card('A9', priceRecipe(price('£10.00'))));
    expect(parseSearchCards(d, 'www.amazon.com')[0].product).toEqual({ ok: false, error: 'UNEXPECTED_CURRENCY' });
    expect(parseSearchCards(d, 'www.amazon.de')).toEqual([]);
  });
});

describe('envío exacto desde el desglose de AmazonGlobal', () => {
  const panel = (rows, resumen = 'US$37.13 de cargos de envío e importación a Argentina') => `<div id="amazonGlobal_feature_div"><span>${resumen}</span> <div>Detalles de envío y tarifa ${rows}</div></div>`;
  const ROWS = 'Precio US$23.98 Envío de AmazonGlobal US$26.52 Cargos estimados de importación US$10.61 Total US$61.11';

  it('lee el envío real (no null) y lo que Amazon estima; no duplica impuestos', () => {
    const d = doc(core(price('US$23.98')) + delivery('Entrega GRATIS el martes a Argentina en pedidos elegibles de más de $99') + panel(ROWS));
    expect(parseProduct(d, 'www.amazon.com')).toEqual({
      ok: true, moneda: 'USD', precio: { min: 23.98, max: 23.98 },
      envio: 26.52, envioIncluyeImportFees: false, amazon: { importacion: 10.61, total: 61.11 },
    });
  });

  it('miles con coma (US$1,026.52) y envío 0 gratis', () => {
    const d = doc(core(price('US$899.00')) + panel('Precio US$899.00 Envío de AmazonGlobal US$0.00 Cargos estimados de importación US$189.00 Total US$1,088.00', 'US$189.00 de cargos de importación y envío gratis a Argentina'));
    const r = parseProduct(d, 'www.amazon.com');
    expect(r.envio).toBe(0);
    expect(r.amazon.total).toBe(1088);
  });

  it('amazon.es: coma decimal', () => {
    const d = doc(core(price('33,05 €')) + panel('Precio 33,05 € Envío de AmazonGlobal 30,50 € Cargos estimados de importación 13,35 € Total 76,90 €', '43,85 € de cargos de envío e importación a Argentina'));
    const r = parseProduct(d, 'www.amazon.es');
    expect(r).toMatchObject({ envio: 30.5, amazon: { importacion: 13.35, total: 76.9 } });
  });

  it('solo la línea resumen sin el desglose: envío suelto desconocido, pero el total de Amazon sí', () => {
    const d = doc(core(price('US$23.98')) + delivery('$37.13 Shipping & Import Fees Deposit to Argentina') + '<div id="amazonGlobal_feature_div"><span>US$37.13 de cargos de envío e importación a Argentina</span></div>');
    const r = parseProduct(d, 'www.amazon.com');
    expect(r.envio).toBeNull();
    expect(r.envioIncluyeImportFees).toBe(true);
    expect(r.amazon.total).toBeCloseTo(61.11);
  });
});

describe('panel de AmazonGlobal con scripts inline', () => {
  it('ignora el código del <script> y lee el total y el envío gratis de un producto caro', () => {
    const html = core(price('US$3,499.99')) + '<div id="amazonGlobal_feature_div"><script>var x = "Total 999"; function f() { return 1; }</script>'
      + '<span>US$1,410.20 de cargos de importación y envío gratis a Argentina</span> <div>Detalles de envío y tarifa Precio US$3,499.99 Envío de AmazonGlobal US$0.00 Cargos estimados de importación US$1,410.20 Total US$4,910.19</div></div>';
    const r = parseProduct(doc(html), 'www.amazon.com');
    expect(r.envio).toBe(0);
    expect(r.amazon).toEqual({ importacion: 1410.2, total: 4910.19 });
  });
});

describe('total de Amazon desde la línea resumen (sin el popover cargado)', () => {
  const resumen = (t) => `<div id="amazonGlobal_feature_div"><script>var t = "Total 999";</script><span>${t}</span> <a>Detalles</a></div>`;

  it('precio + cargos de envío e importación = total de Amazon (US$23.98 + US$37.13 = 61.11)', () => {
    const d = doc(core(price('US$23.98')) + resumen('US$37.13 de cargos de envío e importación a Argentina'));
    const r = parseProduct(d, 'www.amazon.com');
    expect(r.amazon.total).toBeCloseTo(61.11);
    expect(r.envio).toBeNull(); // el envío suelto no se conoce, pero el total sí
  });

  it('"cargos de importación y envío gratis" (producto caro): US$3,499.99 + US$1,410.20', () => {
    const d = doc(core(price('US$3,499.99')) + resumen('US$1,410.20 de cargos de importación y envío gratis a Argentina'));
    expect(parseProduct(d, 'www.amazon.com').amazon.total).toBeCloseTo(4910.19);
  });

  it('con un rango de precios no hay total de Amazon', () => {
    const range = `<span class="a-price-range">${price('US$20.00')}${price('US$35.00')}</span>`;
    const d = doc(core(range) + resumen('US$10.00 de cargos de envío e importación a Argentina'));
    expect(parseProduct(d, 'www.amazon.com').amazon).toBeUndefined();
  });

  it('el resultado es el mismo con o sin el desglose del popover cargado', () => {
    const base = core(price('US$23.98'));
    const linea = 'US$37.13 de cargos de envío e importación a Argentina';
    const sin = parseProduct(doc(base + resumen(linea)), 'www.amazon.com');
    const con = parseProduct(doc(base + `<div id="amazonGlobal_feature_div"><span>${linea}</span> Detalles de envío y tarifa Precio US$23.98 Envío de AmazonGlobal US$26.52 Cargos estimados de importación US$10.61 Total US$61.11</div>`), 'www.amazon.com');
    expect(con.amazon.total).toBeCloseTo(sin.amazon.total);
  });
});

describe('amazonTotalFromHtml (lista → página del producto)', () => {
  const page = (precio, cargos) => `<body>${core(price(precio))}<div id="amazonGlobal_feature_div"><span>${cargos}</span></div></body>`;

  it('devuelve el total real si el precio de la página coincide con el de la tarjeta (US$139.99 + 35.11 = 175.10)', () => {
    expect(amazonTotalFromHtml(page('US$139.99', 'US$35.11 de cargos de importación y envío gratis a Argentina'), 'www.amazon.com', 139.99)).toBeCloseTo(175.1);
  });

  it('null si el precio difiere (otra variante o cupón) o si no hay panel', () => {
    expect(amazonTotalFromHtml(page('US$149.99', 'US$35.11 de cargos de importación y envío gratis a Argentina'), 'www.amazon.com', 139.99)).toBeNull();
    expect(amazonTotalFromHtml(`<body>${core(price('US$139.99'))}</body>`, 'www.amazon.com', 139.99)).toBeNull();
  });
});
