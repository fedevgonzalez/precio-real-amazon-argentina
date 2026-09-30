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

/**
 * Bloque mínimo de la página: total con impuestos en USD y precio en blue en pesos.
 * Todo el resto (desglose, notas, ajustes) vive en el popup de la extensión.
 */
export function buildBlock(doc, { results = [], notes = [], error = null }) {
  const box = el(doc, 'div', undefined, 'margin:8px 0;padding:8px 12px;border:1px solid #067d62;border-radius:8px;font-size:14px;line-height:1.4');
  box.id = 'aar-block';
  box.appendChild(el(doc, 'strong', 'Precio real en Argentina'));

  if (error) {
    box.appendChild(el(doc, 'div', ERROR_TEXT[error] ?? ERROR_TEXT.NO_RATES));
    return box;
  }

  const lo = results[0];
  const hi = results[results.length - 1];
  // "~" = estimación propia; sin "~" es el total que Amazon informa (lo que se cobra en el checkout).
  const mark = hi.fuente === 'amazon' ? '' : '~';
  const range = (fmt, f) => (lo[f] === hi[f] ? `${mark}${fmt.format(lo[f])}` : `${mark}${fmt.format(lo[f])} – ${fmt.format(hi[f])}`);
  // En amazon.es el precio nace en euros: una línea más con el total en EUR, antes de su conversión a USD y a blue.
  if (hi.moneda === 'EUR') box.appendChild(el(doc, 'div', `Total en EUR: ${range(EUR, 'totalMoneda')}`));
  box.appendChild(el(doc, 'div', `Total + imp.: ${range(USD, 'totalUsd')}`));
  box.appendChild(el(doc, 'div', `Blue: ${range(ARS, 'blueArs')}`, 'font-weight:600'));
  if (hasWarnings(results, notes)) {
    box.appendChild(el(doc, 'div', '⚠ Ver detalle en la extensión', 'color:#b12704;font-size:12px'));
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
 * Renglón compacto para una tarjeta de la página de búsqueda:
 * Tres renglones (el primero solo en amazon.es): "Total en EUR: ~EUR 126,69", "Total + imp.: ~USD 143,86",
 * "Blue: ~ARS 224.415". En la lista Amazon no informa los cargos de importación
 * (solo en la página del producto): es una estimación ("~") hasta que se lee el total real. Sin ⚠ por tarjeta.
 */
export function buildCardLine(doc, { results }) {
  const lo = results[0];
  const hi = results[results.length - 1];
  const mark = hi.fuente === 'amazon' ? '' : '~';
  const range = (fmt, f) => (lo[f] === hi[f] ? `${mark}${fmt.format(lo[f])}` : `${mark}${fmt.format(lo[f])} – ${fmt.format(hi[f])}`);
  const line = el(doc, 'div', undefined, 'margin:2px 0;font-size:13px;line-height:1.3;color:#067d62;font-weight:600');
  line.className = 'aar-card';
  if (hi.moneda === 'EUR') line.appendChild(el(doc, 'div', `Total en EUR: ${range(EUR, 'totalMoneda')}`));
  line.appendChild(el(doc, 'div', `Total + imp.: ${range(USD, 'totalUsd')}`));
  line.appendChild(el(doc, 'div', `Blue: ${range(ARS, 'blueArs')}`));
  return line;
}

/** Inserta el renglón debajo del precio de la tarjeta (reemplaza uno previo). false si la tarjeta no tiene precio. */
export function mountCardLine(card, line) {
  card.querySelectorAll('.aar-card').forEach((n) => n.remove());
  const anchor = card.querySelector('[data-cy="price-recipe"]');
  if (!anchor) return false;
  anchor.insertAdjacentElement('afterend', line);
  return true;
}
