import { loadSettings, saveSettings } from '../core/settings.js';
import { buildDetails } from './details.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const $ = (id) => document.getElementById(id);

function mostrar(s) {
  $('enviosUsados').value = s.enviosUsados;
  $('unidades').value = s.unidades;
  $('ivaReducido').checked = s.ivaReducido;
}
mostrar(await loadSettings(storage));

// Guardado automático: cada cambio se sanea, se guarda y se refleja sin botón.
let aviso;
async function guardar() {
  const saved = await saveSettings(storage, {
    enviosUsados: $('enviosUsados').value,
    unidades: $('unidades').value,
    ivaReducido: $('ivaReducido').checked,
  });
  mostrar(saved);
  $('estado').textContent = 'Guardado';
  clearTimeout(aviso);
  aviso = setTimeout(() => { $('estado').textContent = ''; }, 1600);
}
for (const id of ['enviosUsados', 'unidades', 'ivaReducido']) $(id).addEventListener('change', guardar);

// Detalle del producto abierto: se lo pedimos al content script de la pestaña activa.
async function loadDetails() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_DETAILS' });
  } catch {
    return null; // otra pestaña, sin content script o sin cálculo
  }
}
$('detalle').appendChild(buildDetails(document, await loadDetails()));
