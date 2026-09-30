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

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fila(doc, label, value) {
  const f = el(doc, 'div', 'fila');
  f.append(el(doc, 'dt', '', label), el(doc, 'dd', '', value));
  return f;
}

/**
 * Detalle del producto abierto para el popup. `details` es lo que devuelve el content script
 * ({moneda, precio, envio, amazon, results, rates, fetchedAt, notes}); si no hay, texto de estado vacío.
 * Nunca muestra dólar tarjeta. Solo createElement/textContent.
 */
export function buildDetails(doc, details) {
  const box = doc.createElement('section');
  box.id = 'aar-details';
  if (!details?.results?.length) {
    box.append(el(doc, 'p', 'vacio', EMPTY_TEXT));
    return box;
  }

  const { moneda, precio, envio, amazon, results, rates, fetchedAt, notes = [] } = details;
  const lo = results[0];
  const hi = results[results.length - 1];
  const delAmazon = hi.fuente === 'amazon';
  const money = moneda === 'EUR' ? (n) => `EUR ${NUM.format(n)}` : (n) => USD.format(n);
  const rango = (fmt, f) => (lo[f] === hi[f] ? fmt.format(lo[f]) : `${fmt.format(lo[f])} – ${fmt.format(hi[f])}`);

  // Total grande: "USD" chico + cifra en serif; un rango de variantes va en una línea más chica.
  box.append(el(doc, 'p', 'etiqueta', 'Total + impuestos'));
  const total = el(doc, 'p', 'total');
  if (lo.totalUsd === hi.totalUsd) {
    if (!delAmazon) total.append(el(doc, 'span', 'est', '~'));
    const [cur, ...cifra] = USD.format(hi.totalUsd).split(/\s/);
    total.append(el(doc, 'span', 'mon', cur), cifra.join(' '));
  } else {
    total.classList.add('rango');
    total.textContent = `${delAmazon ? '' : '~'}${rango(USD, 'totalUsd')}`;
  }
  box.append(total);

  const blue = el(doc, 'p', 'blue');
  blue.append(el(doc, 'span', 'k', 'Blue'), el(doc, 'span', 'v', `${delAmazon ? '' : '~'}${rango(ARS, 'blueArs')}`));
  box.append(blue);

  box.append(el(doc, 'p', delAmazon ? 'fuente' : 'fuente estimado',
    delAmazon ? 'Total informado por Amazon: es lo que cobra en el checkout.' : 'Estimación propia: IVA 21 % sobre precio + envío (arancel máximo si pasa de USD 400).'));

  const libro = el(doc, 'dl', 'libro');
  libro.append(
    fila(doc, 'Precio', precio.min === precio.max ? money(precio.min) : `${money(precio.min)} – ${money(precio.max)}`),
    fila(doc, 'Envío', envio === null || envio === undefined ? 'no incluido' : money(envio)),
    fila(doc, 'Base (precio + envío)', rango(USD, 'fobUsd')),
    fila(doc, 'Franquicia aplicada', rango(USD, 'franquiciaAplicadaUsd')),
    fila(doc, 'Arancel estimado', rango(USD, 'arancelUsd')),
    fila(doc, 'IVA estimado', rango(USD, 'ivaUsd')),
  );
  if (amazon?.total != null) {
    libro.append(fila(doc, 'Amazon cobra', money(amazon.total)));
    if (amazon.importacion != null) libro.append(fila(doc, 'de eso, importación', money(amazon.importacion)));
  }
  box.append(libro);

  const avisos = [...notes.map((n) => noteText(n)), ...results.flatMap((r) => r.avisos.map((code) => noteText({ code })))];
  if (avisos.length) {
    const ul = el(doc, 'ul', 'avisos');
    ul.setAttribute('aria-label', 'Avisos');
    for (const t of new Set(avisos)) ul.append(el(doc, 'li', '', t));
    box.append(ul);
  }

  if (rates) {
    const hora = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const eur = rates.eurUsd ? ` · EUR/USD ${NUM.format(rates.eurUsd)}` : '';
    box.append(el(doc, 'p', 'tasas', `Blue ${NUM.format(rates.blue)} · Oficial ${NUM.format(rates.oficial)}${eur} · ${hora}`));
  }
  return box;
}
