import { getRates } from './rates.js';

const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k],
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

let rulesPromise;
const loadRules = () => (rulesPromise ??= fetch(chrome.runtime.getURL('src/core/rules.json')).then((r) => r.json()));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'GET_RATES') return false;
  loadRules()
    .then((rules) => getRates({ fetchFn: fetch.bind(globalThis), storage, rules }))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: 'NO_RATES' }));
  return true;
});
