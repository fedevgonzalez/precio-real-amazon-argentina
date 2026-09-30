import { parseProduct, parseSearchCards } from './parser.js';
import { buildBlock, mount, renderSignature, buildCardLine, mountCardLine } from './inject.js';
import { calc } from '../core/calc.js';
import { loadSettings } from '../core/settings.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const rules = await (await fetch(chrome.runtime.getURL('src/core/rules.json'))).json();

let lastSignature = null;
let generation = 0;
// Datos del último cálculo, para el popup (mensaje GET_DETAILS). null si no hay bloque con números.
let lastDetails = null;

const MAX_CARDS = 100;
const isSearchPage = () => /^\/s(\/|$)/.test(location.pathname);

// Página de resultados: un renglón por tarjeta con el mismo cálculo que la página de producto.
async function updateSearch(gen) {
  lastDetails = null;
  document.getElementById('aar-block')?.remove();
  const cards = parseSearchCards(document, location.hostname).slice(0, MAX_CARDS);
  if (!cards.some((c) => c.product.ok)) return;

  const res = await chrome.runtime.sendMessage({ type: 'GET_RATES' });
  if (gen !== generation) return;
  if (!res?.ok) return; // sin cotización no se pinta nada (nunca números inventados)
  const settings = await loadSettings(storage);
  if (gen !== generation) return;
  const base = JSON.stringify([res.rates, settings]);

  observer.disconnect(); // nuestras propias inserciones no deben re-disparar update()
  try {
    for (const { card, product } of cards) {
      if (!product.ok) {
        card.querySelector('.aar-card')?.remove();
        delete card.dataset.aarSig;
        continue;
      }
      const sig = base + JSON.stringify([product.precio, product.envio, product.moneda]);
      if (card.dataset.aarSig === sig && card.querySelector('.aar-card')) continue;
      const results = [product.precio.min, product.precio.max]
        .filter((p, i, a) => i === 0 || p !== a[0])
        .map((precio) => calc({ precio, envio: product.envio ?? 0, moneda: product.moneda }, res.rates, settings, rules));
      if (results.some((r) => !r.ok)) continue;
      card.dataset.aarSig = sig;
      mountCardLine(card, buildCardLine(document, { results, envioDesconocido: product.envio === null }));
    }
  } finally {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

async function update() {
  // Token de generación: una respuesta lenta de una variante anterior no debe pisar a la actual.
  const gen = ++generation;
  if (isSearchPage()) return updateSearch(gen);
  const product = parseProduct(document, location.hostname);
  if (!product.ok) {
    if (product.error === 'NO_SHIP_TO_AR') {
      // El spec pide mostrarlo explícito; el resto de los errores de parser no inyectan nada.
      mountIfChanged('error:NO_SHIP_TO_AR', () => buildBlock(document, { error: 'NO_SHIP_TO_AR' }));
    } else {
      lastSignature = null;
      document.getElementById('aar-block')?.remove();
    }
    lastDetails = null;
    // Páginas sin producto (portada, listas) son normales: nivel debug, no advertencia.
    console.debug('[aar] sin cálculo:', product.error);
    return;
  }

  const res = await chrome.runtime.sendMessage({ type: 'GET_RATES' });
  if (gen !== generation) return;
  if (!res?.ok) {
    lastDetails = null;
    mountIfChanged('error:NO_RATES', () => buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const settings = await loadSettings(storage);
  if (gen !== generation) return;
  const envio = product.envio ?? 0;
  // El total que informa Amazon vale para el precio elegido: con un rango de variantes no se usa.
  const amazonTotal = product.precio.min === product.precio.max ? product.amazon?.total : undefined;
  const results = [product.precio.min, product.precio.max]
    .filter((p, i, a) => i === 0 || p !== a[0])
    .map((precio) => calc({ precio, envio, moneda: product.moneda, amazonTotal }, res.rates, settings, rules));
  if (results.some((r) => !r.ok)) {
    lastDetails = null;
    mountIfChanged('error:NO_RATES', () => buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const notes = [];
  // Nota de cotización vieja: stale (blue/oficial de caché) o un eurUsd reusado cuando el producto es en EUR.
  const eurStale = res.staleRates?.includes('eurUsd') && product.moneda === 'EUR';
  if (res.stale || eurStale) {
    const edades = [
      res.stale ? res.ratesAt?.blue ?? res.fetchedAt : Infinity,
      res.stale ? res.ratesAt?.oficial ?? res.fetchedAt : Infinity,
      eurStale ? res.ratesAt?.eurUsd ?? res.fetchedAt : Infinity,
    ];
    notes.push({ code: 'STALE_RATES', minutes: Math.round((Date.now() - Math.min(...edades)) / 60000) });
  }
  if (res.discrepancy) notes.push({ code: 'RATES_DISCREPANCY' });
  if (product.envioIncluyeImportFees) notes.push({ code: 'ENVIO_CON_IMPORT_FEES' });
  else if (product.envio === null) notes.push({ code: 'ENVIO_NO_INCLUIDO' });

  lastDetails = {
    moneda: product.moneda,
    precio: product.precio,
    envio: product.envio,
    envioIncluyeImportFees: !!product.envioIncluyeImportFees,
    amazon: product.amazon ?? null,
    results,
    rates: res.rates,
    fetchedAt: res.fetchedAt,
    notes,
  };
  mountIfChanged(
    renderSignature({ product, rates: res.rates, settings, stale: res.stale, discrepancy: res.discrepancy, fetchedAt: res.fetchedAt, notes }),
    () => buildBlock(document, { results, notes }),
  );
}

// No remonta si el render es idéntico al anterior y el bloque sigue en el DOM (F1):
// las mutaciones ajenas de la página dejan de cerrar el desglose y de rearmar el bloque.
function mountIfChanged(signature, build) {
  if (signature === lastSignature && document.getElementById('aar-block')) return;
  lastSignature = signature;
  safeMount(document, build());
}

let timer;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => update().catch(onUpdateError), 300);
};

// Si se recarga la extensión con la pestaña abierta, este script queda huérfano: dejamos de escuchar la página
// y avisamos una sola vez que hay que recargarla. Otro error: se quita el bloque para no dejar números viejos.
function onUpdateError(e) {
  lastDetails = null;
  if (String(e?.message).includes('Extension context invalidated')) {
    observer.disconnect();
    clearTimeout(timer);
    try { mount(document, buildBlock(document, { error: 'RELOAD' })); } catch { /* la página cambió: no hay nada más que hacer */ }
    console.warn('[aar] la extensión se recargó: recargá esta pestaña (F5).');
    return;
  }
  document.getElementById('aar-block')?.remove();
  console.warn('[aar]', e);
}

// El popup pide el detalle del producto abierto en la pestaña activa.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'GET_DETAILS') return false;
  sendResponse(lastDetails);
  return false;
});

const observer = new MutationObserver(() => schedule());

// mount() hace remove()+insert cuyas mutaciones targetean el padre del ancla (no el bloque),
// así que el observer las tomaría por ajenas y entraría en update() → mount() → schedule() → …: pausa alrededor.
function safeMount(doc, block) {
  observer.disconnect();
  try {
    mount(doc, block);
  } finally {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

schedule();
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
