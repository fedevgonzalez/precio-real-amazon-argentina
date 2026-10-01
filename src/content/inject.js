// Montos con código ("ARS 150.834", "USD 99,80"): el símbolo "$" confunde junto a los precios USD de Amazon.
const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', currencyDisplay: 'code', maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', currencyDisplay: 'code', maximumFractionDigits: 2 });
const EUR = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'EUR', currencyDisplay: 'code', maximumFractionDigits: 2 });
const ANCHORS = '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, #apex_desktop';

const ERROR_TEXT = {
  NO_SHIP_TO_AR: 'No se envía a Argentina.',
  RELOAD: 'Recargá la página (F5) para actualizar la extensión.',
  NO_RATES: 'Sin cotización disponible.',
};

function el(doc, tag, text, style) {
  const e = doc.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (style) e.style.cssText = style;
  return e;
}

/** ¿Hay algo que pueda cambiar el número? Si sí, el bloque marca "⚠ Ver detalle en la extensión". */
export function hasWarnings(results, notes) {
  return notes.length > 0 || results.some((r) => r.avisos.length > 0);
}

const ESTILO = 'font-size:13px;line-height:1.3;color:#067d62;font-weight:600';

/**
 * Los renglones de una vista compacta, iguales en la página de producto y en la lista:
 * "Total en EUR: ~EUR 126,69" (solo amazon.es), "Total + imp.: ~USD 143,86", "Blue: ~ARS 224.415".
 * "~" = estimación propia; sin "~" es el total que Amazon informa (lo que se cobra en el checkout).
 */
function renglones(doc, results) {
  const lo = results[0];
  const hi = results[results.length - 1];
  const mark = hi.fuente === 'amazon' ? '' : '~';
  const range = (fmt, f) => (lo[f] === hi[f] ? `${mark}${fmt.format(lo[f])}` : `${mark}${fmt.format(lo[f])} – ${fmt.format(hi[f])}`);
  const out = [];
  if (hi.moneda === 'EUR') out.push(el(doc, 'div', `Total en EUR: ${range(EUR, 'totalMoneda')}`));
  out.push(el(doc, 'div', `Total + imp.: ${range(USD, 'totalUsd')}`), el(doc, 'div', `Blue: ${range(ARS, 'blueArs')}`));
  return out;
}

/**
 * Bloque de la página de producto: los renglones compactos, sin caja ni título, y una línea "⚠" si algo
 * puede cambiar el número. Todo el resto (desglose, avisos, ajustes) vive en el popup de la extensión.
 */
export function buildBlock(doc, { results = [], notes = [], error = null }) {
  const box = el(doc, 'div', undefined, `margin:6px 0;${ESTILO}`);
  box.id = 'aar-block';
  if (error) {
    box.appendChild(el(doc, 'div', ERROR_TEXT[error] ?? ERROR_TEXT.NO_RATES));
    return box;
  }
  box.append(...renglones(doc, results));
  if (hasWarnings(results, notes)) {
    box.appendChild(el(doc, 'div', '⚠ Ver detalle en la extensión', 'color:#b12704;font-size:12px;font-weight:400'));
  }
  return box;
}

/**
 * Firma de un render: si no cambió respecto al anterior y #aar-block sigue en el DOM,
 * no hace falta remontar. fetchedAt se redondea a minuto para no rearmar por reloj.
 */
export function renderSignature({ product, rates, settings, stale, discrepancy, fetchedAt, notes }) {
  return JSON.stringify({
    min: product.precio?.min,
    max: product.precio?.max,
    envio: product.envio,
    envioIncluyeImportFees: !!product.envioIncluyeImportFees,
    moneda: product.moneda,
    rates,
    settings,
    stale: !!stale,
    discrepancy: !!discrepancy,
    fetchedAt: Math.round(fetchedAt / 60_000),
    notes,
  });
}

export function mount(doc, block) {
  doc.getElementById('aar-block')?.remove();
  const anchor = doc.querySelector(ANCHORS);
  if (!anchor) return false;
  anchor.insertAdjacentElement('afterend', block);
  return true;
}

/**
 * Renglones para una tarjeta de la página de búsqueda (los mismos que en el producto). En la lista Amazon no
 * informa los cargos de importación (solo en la página del producto): es una estimación ("~") hasta que se
 * lee el total real. Sin ⚠ por tarjeta.
 */
export function buildCardLine(doc, { results }) {
  const line = el(doc, 'div', undefined, `margin:2px 0;${ESTILO}`);
  line.className = 'aar-card';
  line.append(...renglones(doc, results));
  return line;
}

/** Inserta el renglón debajo del precio de la tarjeta (reemplaza uno previo). false si la tarjeta no tiene precio. */
export function mountCardLine(card, line) {
  card.querySelectorAll('.aar-card').forEach((n) => n.remove());
  // Lista de búsqueda: el bloque de precio; carrusel: el enlace que envuelve el precio.
  const precio = card.querySelector('.a-price:not(.a-text-price)');
  const anchor = card.querySelector('[data-cy="price-recipe"], [data-testid="price-section"]') ?? precio?.closest('a') ?? precio;
  if (!anchor) return false;
  anchor.insertAdjacentElement('afterend', line);
  return true;
}
