import(chrome.runtime.getURL('src/content/run.js')).catch((e) => console.warn('[aar] no se pudo cargar el content script:', e));
