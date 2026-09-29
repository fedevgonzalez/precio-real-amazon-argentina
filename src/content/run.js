import { parseProduct } from './parser.js';
import { buildBlock, mount } from './inject.js';
import { calc } from '../core/calc.js';
import { loadSettings } from '../core/settings.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const rules = await (await fetch(chrome.runtime.getURL('src/core/rules.json'))).json();

async function update() {
  const product = parseProduct(document, location.hostname);
  if (!product.ok) {
    document.getElementById('aar-block')?.remove();
    console.warn('[aar] sin cálculo:', product.error);
    return;
  }

  const res = await chrome.runtime.sendMessage({ type: 'GET_RATES' });
  if (!res?.ok) {
    mount(document, buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const settings = await loadSettings(storage);
  const envio = product.envio ?? 0;
  const results = [product.precio.min, product.precio.max]
    .filter((p, i, a) => i === 0 || p !== a[0])
    .map((precio) => calc({ precio, envio, moneda: product.moneda }, res.rates, settings, rules));
  if (results.some((r) => !r.ok)) {
    mount(document, buildBlock(document, { error: 'NO_RATES' }));
    return;
  }

  const notes = [];
  if (res.stale) notes.push({ code: 'STALE_RATES', minutes: Math.round((Date.now() - res.fetchedAt) / 60000) });
  if (res.discrepancy) notes.push({ code: 'RATES_DISCREPANCY' });
  if (product.envioIncluyeImportFees) notes.push({ code: 'ENVIO_CON_IMPORT_FEES' });
  else if (product.envio === null) notes.push({ code: 'ENVIO_NO_INCLUIDO' });

  mount(document, buildBlock(document, { results, rates: res.rates, fetchedAt: res.fetchedAt, notes }));
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(() => update().catch((e) => console.warn('[aar]', e)), 300); };

schedule();
new MutationObserver((muts) => {
  if (muts.every((m) => m.target.closest?.('#aar-block'))) return;
  schedule();
}).observe(document.body, { childList: true, subtree: true, characterData: true });
