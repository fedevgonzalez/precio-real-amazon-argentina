const STORES = [
  { host: /(^|\.)amazon\.com$/, moneda: 'USD', locale: 'en', symbol: '$' },
  { host: /(^|\.)amazon\.es$/, moneda: 'EUR', locale: 'es', symbol: '€' },
];
const PRICE_ROOTS = ['#corePrice_feature_div', '#corePriceDisplay_desktop_feature_div', '#apex_desktop'];
const DELIVERY = '#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage';
const NO_SHIP = /cannot be shipped|can't be shipped|does not ship|no se puede enviar|no puede enviarse|no se envía/i;
const IMPORT_FEES = /import fees|gastos de importaci|tasas de importaci/i;
const FREE = /\bfree\b|gratis/i;
const MONEY = /[$€]\s?[\d.,]+|[\d.,]+\s?€/;

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

// Amazon trae dentro de la página el desglose del popover "Detalles de envío y tarifa":
// "Precio … Envío de AmazonGlobal US$26.52 Cargos estimados de importación US$10.61 Total US$61.11".
// Es el dato exacto del envío (la línea resumen "US$37.13 de cargos de envío e importación" los suma).
function parseAmazonGlobal(doc, store) {
  const text = (doc.querySelector('#amazonGlobal_feature_div')?.textContent ?? '').replace(/[\s ]+/g, ' ');
  const grab = (re) => {
    const m = text.match(re);
    const n = m ? parseAmount(m[1], store.locale) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const envio = grab(/(?:Env[ií]o de AmazonGlobal|AmazonGlobal Shipping)\s*[^\d]*?([\d.,]+)/i);
  if (envio === null) return null;
  return {
    envio,
    importacion: grab(/(?:Cargos estimados de importaci[oó]n|Estimated import (?:fees|charges))\s*[^\d]*?([\d.,]+)/i),
    total: grab(/\bTotal\s*[^\d]*?([\d.,]+)/i),
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

  const global = parseAmazonGlobal(doc, store);
  const ship = global
    ? { envio: global.envio, envioIncluyeImportFees: false }
    : shippingFromText(doc.querySelector(DELIVERY)?.textContent ?? '', store);
  return {
    ok: true,
    moneda: store.moneda,
    precio: { min: Math.min(...amounts), max: Math.max(...amounts) },
    ...ship,
    // Lo que Amazon estima (importación y total): solo para compararlo en el popup.
    ...(global ? { amazon: { importacion: global.importacion, total: global.total } } : {}),
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
  return [...doc.querySelectorAll(CARD)].map((card) => ({ card, product: parseCard(card, store) }));
}
