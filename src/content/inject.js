// Pesos con código "ARS": el símbolo "$" confunde al lado de los montos "$100.00" USD de Amazon.
const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', currencyDisplay: 'code', maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const ANCHORS = '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, #apex_desktop';

const NOTE_TEXT = {
  STALE_RATES: (n) => `Cotización de hace ${n.minutes} min (no se pudo actualizar).`,
  RATES_DISCREPANCY: () => 'Las fuentes de cotización difieren más de 5 %.',
  ENVIO_NO_INCLUIDO: () => 'Envío no incluido en el cálculo.',
  ENVIO_CON_IMPORT_FEES: () => 'Amazon combina el envío con "import fees": envío no incluido para no duplicar impuestos.',
  FUERA_REGIMEN_SIMPLIFICADO: () => 'Fuera del régimen simplificado (tope USD 3.000 o más de 3 unidades): el cálculo es orientativo.',
};
const noteText = (n) => (NOTE_TEXT[n.code] ? NOTE_TEXT[n.code](n) : String(n.code));

function el(doc, tag, text, style) {
  const e = doc.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (style) e.style.cssText = style;
  return e;
}

export function buildBlock(doc, { results = [], rates, fetchedAt, notes = [], error = null }) {
  const box = el(doc, 'div', undefined, 'margin:8px 0;padding:8px 12px;border:1px solid #067d62;border-radius:8px;font-size:14px;line-height:1.4');
  box.id = 'aar-block';
  box.appendChild(el(doc, 'strong', 'Precio real en Argentina'));

  if (error) {
    box.appendChild(el(doc, 'div', 'Sin cotización disponible.'));
    return box;
  }

  const lo = results[0];
  const hi = results[results.length - 1];
  const range = (f) => (lo[f] === hi[f] ? ARS.format(lo[f]) : `${ARS.format(lo[f])} – ${ARS.format(hi[f])}`);
  box.appendChild(el(doc, 'div', `Blue: ${range('blueArs')}`));
  box.appendChild(el(doc, 'div', `Tarjeta: ${range('tarjetaArs')}`));
  const cheaper = hi.masBarata === 'blue' ? 'Blue' : 'Tarjeta';
  box.appendChild(el(doc, 'div', `Más barata: ${cheaper}`, 'font-weight:600'));

  // Dedup por código: en un rango, min y máx pueden emitir el mismo aviso (p. ej. FUERA_REGIMEN_SIMPLIFICADO).
  const avisos = [...notes, ...results.flatMap((r) => r.avisos.map((code) => ({ code })))];
  const rendered = new Set();
  for (const n of avisos) {
    if (rendered.has(n.code)) continue;
    rendered.add(n.code);
    box.appendChild(el(doc, 'div', noteText(n), 'color:#b12704;font-size:12px'));
  }

  const det = el(doc, 'details');
  det.appendChild(el(doc, 'summary', 'Ver desglose'));
  const rows = [
    ['Base (precio + envío)', USD.format(hi.fobUsd)],
    ['Franquicia aplicada', USD.format(hi.franquiciaAplicadaUsd)],
    ['Arancel', USD.format(hi.arancelUsd)],
    ['IVA', USD.format(hi.ivaUsd)],
    ['Total en USD', USD.format(hi.totalUsd)],
    ['Pago a Amazon (tarjeta / dólares)', USD.format(hi.pagoAmazonUsd)],
    ['Tributos de aduana (en pesos, al courier)', ARS.format(hi.aduanaArs)],
  ];
  for (const [k, v] of rows) det.appendChild(el(doc, 'div', `${k}: ${v}`));
  if (rates) {
    const hora = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('es-AR') : '—';
    const eur = rates.eurUsd ? `, EUR/USD ${rates.eurUsd}` : '';
    det.appendChild(el(doc, 'div', `Cotizaciones (${hora}): blue ${rates.blue}, oficial ${rates.oficial}${eur}`));
  }
  box.appendChild(det);

  box.appendChild(el(doc, 'div', 'Estimación, puede diferir del cargo final. El arancel real depende del producto.', 'color:#565959;font-size:11px'));
  return box;
}

/**
 * Firma de un render (F1): si no cambió respecto al anterior y #aar-block sigue en el DOM,
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
  const prev = doc.getElementById('aar-block');
  // Al remontar se conserva el estado del desglose: si el bloque viejo estaba abierto, el nuevo también.
  if (prev?.querySelector('details')?.open) block.querySelector('details')?.setAttribute('open', '');
  prev?.remove();
  const anchor = doc.querySelector(ANCHORS);
  if (!anchor) return false;
  anchor.insertAdjacentElement('afterend', block);
  return true;
}
