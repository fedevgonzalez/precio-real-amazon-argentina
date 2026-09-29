import { loadSettings, saveSettings } from '../core/settings.js';

const storage = {
  get: async (k) => (await chrome.storage.sync.get(k))[k],
  set: (k, v) => chrome.storage.sync.set({ [k]: v }),
};
const $ = (id) => document.getElementById(id);

const s = await loadSettings(storage);
$('enviosUsados').value = s.enviosUsados;
$('unidades').value = s.unidades;
$('ivaReducido').checked = s.ivaReducido;

$('guardar').addEventListener('click', async () => {
  const saved = await saveSettings(storage, {
    enviosUsados: $('enviosUsados').value,
    unidades: $('unidades').value,
    ivaReducido: $('ivaReducido').checked,
  });
  $('enviosUsados').value = saved.enviosUsados;
  $('unidades').value = saved.unidades;
  $('estado').textContent = ' Guardado';
});
