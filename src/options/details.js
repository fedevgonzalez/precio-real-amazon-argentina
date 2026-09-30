// Textos de los avisos del cálculo (el bloque de la página solo marca "⚠ Ver detalle").
const NOTE_TEXT = {
  STALE_RATES: (n) => `Cotización de hace ${n.minutes} min (no se pudo actualizar).`,
  RATES_DISCREPANCY: () => 'Las fuentes de cotización difieren más de 5 %.',
  ENVIO_NO_INCLUIDO: () => 'Envío no incluido en el cálculo.',
  ENVIO_CON_IMPORT_FEES: () => 'Amazon combina el envío con "import fees": envío no incluido para no duplicar impuestos.',
  FUERA_REGIMEN_SIMPLIFICADO: () => 'Fuera del régimen simplificado (tope USD 3.000 o más de 3 unidades): el cálculo es orientativo.',
};

function noteText(n) {
  return NOTE_TEXT[n.code] ? NOTE_TEXT[n.code](n) : String(n.code);
}

const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', currencyDisplay: 'code', maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', currencyDisplay: 'code', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const EMPTY_TEXT = 'Abrí un producto de amazon.com o amazon.es para ver el detalle.';

function row(doc, label, value) {
  const d = doc.createElement('div');
  d.textContent = `${label}: ${value}`;
  return d;
}

/**
 * Detalle del producto abierto para el popup. `details` es lo que devuelve el content script
 * ({moneda, precio, envio, envioIncluyeImportFees, results, rates, fetchedAt, notes}); si no hay, texto vacío.
 * Nunca muestra dólar tarjeta. Solo createElement/textContent.
 */
export function buildDetails(doc, details) {
  const box = doc.createElement('section');
  box.id = 'aar-details';
  if (!details?.results?.length) {
    box.textContent = EMPTY_TEXT;
    return box;
  }

  const { moneda, precio, envio, results, rates, fetchedAt, notes = [] } = details;
  const lo = results[0];
  const hi = results[results.length - 1];
  const money = moneda === 'EUR' ? (n) => `EUR ${NUM.format(n)}` : (n) => USD.format(n);
  const range = (fmt, f) => (lo[f] === hi[f] ? fmt.format(lo[f]) : `${fmt.format(lo[f])} – ${fmt.format(hi[f])}`);

  const title = doc.createElement('strong');
  title.textContent = 'Producto actual';
  box.appendChild(title);

  box.appendChild(row(doc, 'Precio', precio.min === precio.max ? money(precio.min) : `${money(precio.min)} – ${money(precio.max)}`));
  box.appendChild(row(doc, 'Envío', envio === null || envio === undefined ? 'no incluido' : money(envio)));
  box.appendChild(row(doc, 'Base (precio + envío)', range(USD, 'fobUsd')));
  box.appendChild(row(doc, 'Franquicia aplicada', range(USD, 'franquiciaAplicadaUsd')));
  box.appendChild(row(doc, 'Arancel', range(USD, 'arancelUsd')));
  box.appendChild(row(doc, 'IVA', range(USD, 'ivaUsd')));
  box.appendChild(row(doc, 'Total + impuestos', range(USD, 'totalUsd')));
  box.appendChild(row(doc, 'Total calculado con', hi.fuente === 'amazon' ? 'el total que informa Amazon' : 'estimación propia (IVA 21 % + arancel máximo)'));
  box.appendChild(row(doc, 'Blue', range(ARS, 'blueArs')));

  if (details.amazon?.total != null) {
    const imp = details.amazon.importacion != null ? ` (importación ${money(details.amazon.importacion)})` : '';
    box.appendChild(row(doc, 'Amazon estima', `total ${money(details.amazon.total)}${imp}`));
  }

  if (rates) {
    const hora = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('es-AR') : '—';
    const eur = rates.eurUsd ? `, EUR/USD ${rates.eurUsd}` : '';
    box.appendChild(row(doc, `Cotizaciones (${hora})`, `blue ${rates.blue}, oficial ${rates.oficial}${eur}`));
  }

  const avisos = [...notes.map((n) => noteText(n)), ...results.flatMap((r) => r.avisos.map((code) => noteText({ code })))];
  for (const t of new Set(avisos)) {
    const d = doc.createElement('div');
    d.style.cssText = 'color:#b12704;font-size:12px';
    d.textContent = `⚠ ${t}`;
    box.appendChild(d);
  }

  const small = doc.createElement('div');
  small.style.cssText = 'color:#565959;font-size:11px;margin-top:4px';
  small.textContent = 'Estimación, puede diferir del cargo final. El arancel real depende del producto.';
  box.appendChild(small);
  return box;
}
