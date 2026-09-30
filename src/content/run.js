import { parseProduct } from './parser.js';
import { buildBlock, mount, renderSignature } from './inject.js';
import { calc } from '../core/calc.js';
import { loadSettings } from '../core/settings.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const rules = await (await fetch(chrome.runtime.getURL('src/core/rules.json'))).json();

let lastSignature = null;
let generation = 0;

async function update() {
  // Token de generación: una respuesta lenta de una variante anterior no debe pisar a la actual.
  const gen = ++generation;
  const product = parseProduct(document, location.hostname);
  if (!product.ok) {
    if (product.error === 'NO_SHIP_TO_AR') {
      // El spec pide mostrarlo explícito; el resto de los errores de parser no inyectan nada.
      mountIfChanged('error:NO_SHIP_TO_AR', () => buildBlock(document, { error: 'NO_SHIP_TO_AR' }));
    } else {
      lastSignature = null;
      document.getElementById('aar-block')?.remove();
    }
    console.warn('[aar] sin cálculo:', product.error);
    return;
  }

  const res = await chrome.runtime.sendMessage({ type: 'GET_RATES' });
  if (gen !== generation) return;
  if (!res?.ok) {
    mountIfChanged('error:NO_RATES', () => buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const settings = await loadSettings(storage);
  if (gen !== generation) return;
  const envio = product.envio ?? 0;
  const results = [product.precio.min, product.precio.max]
    .filter((p, i, a) => i === 0 || p !== a[0])
    .map((precio) => calc({ precio, envio, moneda: product.moneda }, res.rates, settings, rules));
  if (results.some((r) => !r.ok)) {
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

  mountIfChanged(
    renderSignature({ product, rates: res.rates, settings, stale: res.stale, discrepancy: res.discrepancy, fetchedAt: res.fetchedAt, notes }),
    () => buildBlock(document, { results, rates: res.rates, fetchedAt: res.fetchedAt, notes }),
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
  timer = setTimeout(() => update().catch((e) => { document.getElementById('aar-block')?.remove(); console.warn('[aar]', e); }), 300);
};

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
