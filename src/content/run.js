import { parseProduct, parseSearchCards, parseCarouselCards, amazonTotalFromHtml } from './parser.js';
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

// Nuestras propias inserciones no deben re-disparar update(): el observer se pausa mientras escribimos.
function paused(fn) {
  observer.disconnect();
  try {
    fn();
  } finally {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

// Cada tarjeta de la lista muestra una estimación ("~"); en amazon.com se reemplaza por el total real de Amazon,
// leído de la página del producto (solo ahí Amazon informa los cargos de importación), con caché por ASIN.
const FETCH_POOL = 3;
const MAX_FETCH = 40;
const MAX_FETCH_CARRUSEL = 16; // menos pedidos de fondo en recomendaciones: están en casi todas las páginas
const TOTAL_TTL_MS = 6 * 3600 * 1000;
const MAX_TOTALES = 300;
const cardState = new WeakMap();
const fetchQueue = [];
let fetching = 0;
let queued = 0;
let queuedCarrusel = 0;

function renderCard(card) {
  const st = cardState.get(card);
  if (!st) return;
  const { product, res, settings, base } = st;
  const real = card.dataset.aarTotal ? Number(card.dataset.aarTotal) : undefined;
  const sig = base + JSON.stringify([product.precio, product.envio, product.moneda, real]);
  if (card.dataset.aarSig === sig && card.querySelector('.aar-card')) return;
  const amazonTotal = product.precio.min === product.precio.max ? real : undefined;
  const results = [product.precio.min, product.precio.max]
    .filter((p, i, a) => i === 0 || p !== a[0])
    .map((precio) => calc({ precio, envio: product.envio ?? 0, moneda: product.moneda, amazonTotal }, res.rates, settings, rules));
  if (results.some((r) => !r.ok)) return;
  card.dataset.aarSig = sig;
  mountCardLine(card, buildCardLine(document, { results }));
}

// Caché de totales reales por ASIN: un solo objeto en storage.local que se poda al escribir
// (vencidos fuera y como mucho MAX_TOTALES), para que no crezca sin límite.
async function guardarTotal(asin, entrada) {
  const { totales = {} } = await chrome.storage.local.get('totales');
  totales[asin] = entrada;
  const vivos = Object.entries(totales)
    .filter(([, v]) => Date.now() - v.at < TOTAL_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_TOTALES);
  await chrome.storage.local.set({ totales: Object.fromEntries(vivos) });
}

async function realTotal(asin, precio) {
  const hit = ((await chrome.storage.local.get('totales')).totales ?? {})[asin];
  if (hit && Date.now() - hit.at < TOTAL_TTL_MS && hit.precio === precio) return hit.total;
  try {
    const r = await fetch(`${location.origin}/dp/${asin}?th=1`, { credentials: 'include' });
    if (!r.ok) return null; // bloqueado o caído: queda la estimación y se reintenta en otra visita
    const total = amazonTotalFromHtml(await r.text(), location.hostname, precio);
    await guardarTotal(asin, { total, precio, at: Date.now() });
    return total;
  } catch {
    return null;
  }
}

function pumpFetches() {
  while (fetching < FETCH_POOL && fetchQueue.length) {
    const { card, asin, precio } = fetchQueue.shift();
    fetching++;
    realTotal(asin, precio)
      .then((total) => {
        if (total == null || !card.isConnected) return;
        card.dataset.aarTotal = String(total);
        paused(() => renderCard(card));
      })
      .catch(() => {})
      .finally(() => { fetching--; pumpFetches(); });
  }
}

// Tarjetas de producto que no son la página principal: resultados de búsqueda y carruseles de recomendaciones.
// Un renglón por tarjeta con el mismo cálculo que la página de producto.
async function updateCards(gen, conBusqueda) {
  const cards = [
    ...(conBusqueda ? parseSearchCards(document, location.hostname).map((c) => ({ ...c, tipo: 'busqueda' })) : []),
    ...parseCarouselCards(document, location.hostname).map((c) => ({ ...c, tipo: 'carrusel' })),
  ].slice(0, MAX_CARDS);
  if (!cards.some((c) => c.product.ok)) return;

  const res = await chrome.runtime.sendMessage({ type: 'GET_RATES' });
  if (gen !== generation) return;
  if (!res?.ok) return; // sin cotización no se pinta nada (nunca números inventados)
  const settings = await loadSettings(storage);
  if (gen !== generation) return;
  const base = JSON.stringify([res.rates, settings]);
  const conTotalReal = location.hostname.endsWith('amazon.com');

  paused(() => {
    for (const { card, product, asin, tipo } of cards) {
      if (!product.ok) {
        card.querySelector('.aar-card')?.remove();
        delete card.dataset.aarSig;
        continue;
      }
      cardState.set(card, { product, res, settings, base });
      renderCard(card);
      const hayCupo = tipo === 'carrusel' ? queuedCarrusel < MAX_FETCH_CARRUSEL : queued < MAX_FETCH;
      if (conTotalReal && asin && product.precio.min === product.precio.max && !card.dataset.aarTried && hayCupo) {
        card.dataset.aarTried = '1';
        if (tipo === 'carrusel') queuedCarrusel++; else queued++;
        fetchQueue.push({ card, asin, precio: product.precio.min });
      }
    }
  });
  pumpFetches();
}

async function update() {
  // Token de generación: una respuesta lenta de una variante anterior no debe pisar a la actual.
  const gen = ++generation;
  if (isSearchPage()) {
    lastDetails = null;
    document.getElementById('aar-block')?.remove();
    return updateCards(gen, true);
  }
  await updateProduct(gen);
  if (gen === generation) await updateCards(gen, false); // carruseles de recomendaciones de la misma página
}

async function updateProduct(gen) {
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
  // Nota de cotización vieja: el blue salió de caché, o un eurUsd reusado cuando el producto es en EUR.
  const eurStale = res.staleRates?.includes('eurUsd') && product.moneda === 'EUR';
  if (res.stale || eurStale) {
    const edades = [
      res.stale ? res.ratesAt?.blue ?? res.fetchedAt : Infinity,
      eurStale ? res.ratesAt?.eurUsd ?? res.fetchedAt : Infinity,
    ];
    notes.push({ code: 'STALE_RATES', minutes: Math.round((Date.now() - Math.min(...edades)) / 60000) });
  }
  if (res.discrepancy) notes.push({ code: 'RATES_DISCREPANCY' });
  // Con el total de Amazon el envío ya está incluido: no hay nada que avisar.
  if (!product.amazon) {
    if (product.envioIncluyeImportFees) notes.push({ code: 'ENVIO_CON_IMPORT_FEES' });
    else if (product.envio === null) notes.push({ code: 'ENVIO_NO_INCLUIDO' });
  }

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

// Un cambio de ajustes en el popup recalcula esta pestaña sin esperar a que la página cambie.
chrome.storage.onChanged.addListener((cambios, area) => { if (area === 'sync' && cambios.settings) schedule(); });

schedule();
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
