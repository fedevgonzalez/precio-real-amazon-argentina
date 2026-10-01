const STORES = [
  { host: /(^|\.)amazon\.com$/, moneda: 'USD', locale: 'en', symbol: '$' },
  { host: /(^|\.)amazon\.es$/, moneda: 'EUR', locale: 'es', symbol: '€' },
];
const PRICE_ROOTS = ['#corePrice_feature_div', '#corePriceDisplay_desktop_feature_div', '#apex_desktop'];
const DELIVERY = '#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage';
const NO_SHIP = /cannot be shipped|can't be shipped|does not ship|no se puede enviar|no puede enviarse|no se envía/i;
const IMPORT_FEES = /import fees|gastos de importaci|tasas de importaci/i;
const FREE = /\bfree\b|gratis/i;
// El lookbehind evita pegar el importe a dígitos vecinos del texto aplanado (reseñas "1.751" + "76,49€").
const MONEY = /(?<![\d.,])(?:[$€]\s?[\d.,]+|[\d.,]+\s?€)/;

export function parseAmount(text, locale) {
  const m = String(text).replace(/[\s ]/g, '').match(/[\d.,]+/);
  if (!m) return NaN;
  const s = locale === 'es' ? m[0].replace(/\./g, '').replace(',', '.') : m[0].replace(/,/g, '');
  return Number(s);
}

function findPriceTexts(doc) {
  for (const root of PRICE_ROOTS) {
    const el = doc.querySelector(root);
    if (!el) continue;
    const range = el.querySelector('.a-price-range');
    const nodes = range
      ? [...range.querySelectorAll('.a-offscreen')]
      : [el.querySelector('.a-price:not(.a-text-price) .a-offscreen')].filter(Boolean);
    if (nodes.length) return nodes.map((n) => n.textContent);
  }
  return [];
}

function shippingFromText(text, store) {
  if (IMPORT_FEES.test(text)) return { envio: null, envioIncluyeImportFees: true };
  if (FREE.test(text)) return { envio: MONEY.test(text) ? null : 0, envioIncluyeImportFees: false };
  const money = text.match(MONEY);
  const envio = money ? parseAmount(money[0], store.locale) : NaN;
  return { envio: Number.isFinite(envio) ? envio : null, envioIncluyeImportFees: false };
}

// Panel de AmazonGlobal. Dos datos, del más estable al menos:
// 1) Línea resumen siempre visible: "US$37.13 de cargos de envío e importación a Argentina"
//    (o "…de cargos de importación y envío gratis"). Precio + esos cargos = lo que Amazon cobra en el checkout.
// 2) Desglose del popover (solo si ya está cargado en la página): "Envío de AmazonGlobal … Cargos estimados de
//    importación … Total …".
function parseAmazonGlobal(doc, store) {
  // El panel trae <script>s inline: se quitan para no leer "Total" ni números del código.
  const panel = doc.querySelector('#amazonGlobal_feature_div')?.cloneNode(true);
  panel?.querySelectorAll('script,style').forEach((n) => n.remove());
  const text = (panel?.textContent ?? '').replace(/[\s ]+/g, ' ').trim();
  const grab = (re) => {
    const m = text.match(re);
    const n = m ? parseAmount(m[1], store.locale) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const cargos = grab(/^[^\d\s]{0,4}\s?([\d.,]+)\s?€?\s+(?=de cargos|cargos|Shipping|Import|Fees)/i);
  const envio = grab(/(?:Env[ií]o de AmazonGlobal|AmazonGlobal Shipping)\s*[^\d]*?([\d.,]+)/i);
  const total = grab(/\bTotal\s*[^\d]*?([\d.,]+)/i);
  if (cargos === null && envio === null) return null;
  return {
    cargos,
    envio,
    importacion: grab(/(?:Cargos estimados de importaci[oó]n|Estimated import (?:fees|charges))\s*[^\d]*?([\d.,]+)/i),
    total,
  };
}

export function parseProduct(doc, hostname) {
  const store = STORES.find((s) => s.host.test(hostname));
  if (!store) return { ok: false, error: 'UNSUPPORTED_HOST' };

  if (NO_SHIP.test(doc.querySelector(DELIVERY)?.textContent ?? '')) return { ok: false, error: 'NO_SHIP_TO_AR' };

  const texts = findPriceTexts(doc);
  if (!texts.length) return { ok: false, error: 'PRICE_NOT_FOUND' };
  if (texts.some((t) => !t.includes(store.symbol))) return { ok: false, error: 'UNEXPECTED_CURRENCY' };

  const amounts = texts.map((t) => parseAmount(t, store.locale));
  if (amounts.some((a) => !Number.isFinite(a) || a <= 0)) return { ok: false, error: 'PRICE_NOT_FOUND' };

  const precio = { min: Math.min(...amounts), max: Math.max(...amounts) };
  const global = parseAmazonGlobal(doc, store);
  // Total real de Amazon: precio + cargos (línea resumen), o el Total del desglose. Con un rango de variantes no hay total.
  const amazonTotal = !global || precio.min !== precio.max
    ? null
    : global.cargos !== null ? precio.min + global.cargos : global.total;
  const ship = global?.envio != null
    ? { envio: global.envio, envioIncluyeImportFees: false }
    : shippingFromText(doc.querySelector(DELIVERY)?.textContent ?? '', store);
  return {
    ok: true,
    moneda: store.moneda,
    precio,
    ...ship,
    ...(amazonTotal !== null ? { amazon: { importacion: global.importacion, total: amazonTotal } } : {}),
  };
}

// --- Página de resultados de búsqueda ---------------------------------------------------------
const CARD = '[data-component-type="s-search-result"]';
const CARD_PRICE = '[data-cy="price-recipe"]';
const CARD_DELIVERY = '[data-cy="delivery-recipe"]';

/** Precio (o rango) y envío de una tarjeta de resultados. Mismo contrato que parseProduct, sin NO_SHIP. */
function parseCard(card, store) {
  const root = card.querySelector(CARD_PRICE);
  if (!root) return { ok: false, error: 'PRICE_NOT_FOUND' };
  const range = root.querySelector('.a-price-range');
  const nodes = range
    ? [...range.querySelectorAll('.a-offscreen')]
    : [root.querySelector('.a-price:not(.a-text-price) .a-offscreen')].filter(Boolean);
  if (!nodes.length) return { ok: false, error: 'PRICE_NOT_FOUND' };
  const texts = nodes.map((n) => n.textContent);
  if (texts.some((t) => !t.includes(store.symbol))) return { ok: false, error: 'UNEXPECTED_CURRENCY' };
  const amounts = texts.map((t) => parseAmount(t, store.locale));
  if (amounts.some((a) => !Number.isFinite(a) || a <= 0)) return { ok: false, error: 'PRICE_NOT_FOUND' };
  return {
    ok: true,
    moneda: store.moneda,
    precio: { min: Math.min(...amounts), max: Math.max(...amounts) },
    ...shippingFromText(card.querySelector(CARD_DELIVERY)?.textContent ?? '', store),
  };
}

/** Todas las tarjetas de una página de búsqueda: [{card, product}] (product como parseProduct). */
export function parseSearchCards(doc, hostname) {
  const store = STORES.find((s) => s.host.test(hostname));
  if (!store) return [];
  return [...doc.querySelectorAll(CARD)].map((card) => ({ card, asin: card.getAttribute('data-asin'), product: parseCard(card, store) }));
}

// --- Carruseles de recomendaciones ("Vistos frecuentemente", "También vieron", …) -----------------
// Cada tarjeta trae el precio y una leyenda de entrega: "US$50.03 de envío", "Entrega GRATIS …" o
// "Entrega GRATIS … en US$99 de artículos elegibles" (gratis condicionado → envío desconocido).
function shippingFromCardText(flat, store) {
  const pagado = flat.match(new RegExp(`(${MONEY.source})\\s*de env[ií]o`, 'i'));
  if (pagado) {
    const n = parseAmount(pagado[1], store.locale);
    if (Number.isFinite(n)) return { envio: n, envioIncluyeImportFees: false };
  }
  const i = flat.search(/Entrega|Rec[ií]belo|Env[ií]o|Shipping|delivery/i);
  return shippingFromText(i < 0 ? '' : flat.slice(i, i + 140), store);
}

function parseCarouselCard(card, store) {
  const node = card.querySelector('.a-price:not(.a-text-price) .a-offscreen');
  if (!node) return { ok: false, error: 'PRICE_NOT_FOUND' };
  if (!node.textContent.includes(store.symbol)) return { ok: false, error: 'UNEXPECTED_CURRENCY' };
  // Algunos carruseles traen el texto oculto sin separador decimal ("US$7491" = 74,91): se arma con entero + fracción.
  const price = node.closest('.a-price');
  const whole = price.querySelector('.a-price-whole')?.textContent.replace(/\D/g, '');
  const frac = price.querySelector('.a-price-fraction')?.textContent.replace(/\D/g, '');
  const a = whole ? Number(`${whole}.${frac || '0'}`) : parseAmount(node.textContent, store.locale);
  if (!Number.isFinite(a) || a <= 0) return { ok: false, error: 'PRICE_NOT_FOUND' };
  // Sin nuestro propio rengl\u00f3n: si no, en la re-lectura su "ARS 116.519" se pega al env\u00edo y se fusionan los importes.
  const copia = card.cloneNode(true);
  copia.querySelectorAll('.aar-card').forEach((e) => e.remove());
  const flat = copia.textContent.replace(/[\s\u00a0]+/g, ' ');
  return { ok: true, moneda: store.moneda, precio: { min: a, max: a }, ...shippingFromCardText(flat, store) };
}

function carouselAsin(card) {
  return card.getAttribute('data-asin')
    ?? card.querySelector('[data-asin]')?.getAttribute('data-asin')
    ?? card.querySelector('a[href*="/dp/"]')?.getAttribute('href')?.match(/\/dp\/([A-Z0-9]{10})/)?.[1]
    ?? null;
}

/** Tarjetas de los carruseles de recomendaciones y de la grilla de ofertas (/deals) y de envío gratis (/fmc) de cualquier página: [{card, asin, product}]. */
export function parseCarouselCards(doc, hostname) {
  const store = STORES.find((s) => s.host.test(hostname));
  if (!store) return [];
  return [...doc.querySelectorAll('.a-carousel-card, [data-testid="product-card"], .a-cardui[id^="gridElement-"]')].map((card) => ({ card, asin: carouselAsin(card), product: parseCarouselCard(card, store) }));
}

/** Total real de Amazon de un producto, leído del HTML de su página (para la lista). null si no hay o el precio no coincide. */
export function amazonTotalFromHtml(html, hostname, precio) {
  const p = parseProduct(new DOMParser().parseFromString(html, 'text/html'), hostname);
  return p.ok && p.amazon && Math.abs(p.precio.min - precio) < 0.005 ? p.amazon.total : null;
}
