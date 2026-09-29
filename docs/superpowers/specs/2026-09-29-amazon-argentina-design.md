# Extensión "Precio real Amazon Argentina" — Diseño

Fecha: 2026-09-29 · Estado: pendiente de revisión

## 1. Objetivo

Extensión de navegador (Chrome/Edge, Manifest V3) que, en **amazon.com** y **amazon.es**, muestra junto al precio el **costo final en pesos argentinos**: conversión a dólar blue (o tarjeta) más los impuestos de importación por courier a domicilio.

Uso personal. Se instala con "Cargar descomprimida"; no se publica en la Web Store.

### Decisiones tomadas con el usuario
- Modo de envío: **courier a domicilio** (Amazon Global / DHL / FedEx). No casilleros.
- Conversión: se muestran **ambas** opciones y se marca la más barata:
  - **Dólar blue** (USD/EUR fondeados al blue y pagados con tarjeta o cuenta en dólares, sin percepciones).
  - **Tarjeta en pesos** (dólar oficial + percepciones).
- Arquitectura: **MV3 sin backend**, cálculo puro aislado, reglas en `rules.json`.

### Fuente de las reglas (NO verificadas contra ARCA)
Tomadas de impuestito.org (2026-09-29). Deben contrastarse con ARCA o con una compra real antes de confiar en el resultado.
- Franquicia USD 400 FOB por envío, cupo único de 5 envíos por año y por persona (Decreto 604/2026, RG ARCA 5884/2026).
- Dentro de franquicia: sin derechos ni Tasa Estadística; IVA 21 % (más Impuestos Internos si aplican).
- Sobre USD 400: régimen general sobre el excedente. Cupo agotado: régimen general sobre el total.
- Tope simplificado: USD 3.000 FOB por envío, 3 unidades de la misma especie.
- Impuesto PAIS derogado. Percepción Ganancias 30 % sobre tarjeta.
- Base de cálculo: precio + envío, **sin** el "import fees" de Amazon.

## 2. Estructura

```
amazon-argentina-extension/
├─ manifest.json            MV3; hosts: amazon.com, amazon.es + APIs de cotización
├─ src/
│  ├─ content/
│  │  ├─ parser.js          lee precio, envío y moneda del DOM (selectores aislados)
│  │  └─ inject.js          dibuja el bloque "Precio real ARS" junto al precio
│  ├─ background/
│  │  └─ rates.js           service worker: pide cotizaciones y las cachea (10 min)
│  ├─ core/
│  │  ├─ calc.js            función pura: (precio, envío, moneda, cotizaciones, ajustes) → desglose
│  │  └─ rules.json         franquicia, cupo, IVA, percepciones (editable sin tocar código)
│  └─ options/              popup y opciones: envíos usados, IVA reducido, método de pago
└─ tests/                   unitarios de calc.js + parser con HTML guardado de Amazon
```

### Responsabilidades
- `parser`: único que conoce el HTML de Amazon. Devuelve `{precio, envío, moneda}`.
- `rates`: único que sale a la red. Cotizaciones: blue, oficial, EUR/USD.
- `calc`: sin DOM ni red; todo por parámetro. Lo más probado.
- `inject`: solo pinta; no calcula.

### Flujo
Página carga → `parser` extrae → pide cotizaciones a `rates` → `calc` arma el desglose → `inject` lo muestra. Un `MutationObserver` repite el ciclo al cambiar variante o precio.

### Reglas en `calc`
- Base FOB = precio + envío, en USD (EUR × EUR/USD si es amazon.es).
- Con cupo disponible: hasta USD 400 paga solo IVA 21 %; el excedente paga IVA más régimen general (arancel por defecto en `rules.json`, depende de categoría).
- Cupo agotado: régimen general sobre el total, sin franquicia.
- Blue: ARS = USD total (con impuestos) × blue.
- Tarjeta: ARS = USD total (con impuestos) × oficial × (1 + percepciones). Percepciones arrancan en 30 % (Ganancias).

## 3. Errores y casos borde

**Cotizaciones**
- API caída: se usa la última cacheada y se muestra "cotización de hace X min". Sin caché: "sin cotización", nunca un número inventado.
- Dos APIs de respaldo por cotización; si difieren más de 5 % se advierte, sin elegir en silencio.
- Timeout 4 s por consulta. Caché de 10 min en `chrome.storage.local` (el service worker de MV3 se duerme).

**Precio**
- No se encuentra: no se inyecta nada y se avisa en consola.
- Rango ("USD 20 – 35"): se muestra el rango convertido y se recalcula al elegir variante.
- Envío "gratis", con monto o ausente; si no se puede leer se asume 0 y el bloque avisa "envío no incluido".
- "Import fees" de Amazon: ignorado a propósito.
- Producto que no se envía a Argentina: "no se envía a Argentina", sin cálculo.
- Moneda inesperada: no se calcula y se avisa.

**Cálculo**
- Entradas inválidas (≤ 0 o NaN): error tipado; `inject` no pinta.
- Un solo redondeo, al final, a pesos enteros.
- Sobre USD 3.000 FOB o más de 3 unidades: aviso de que sale del régimen simplificado.
- Cupo guardado en `chrome.storage.sync`, actualizado manualmente por el usuario.
- IVA reducido: interruptor apagado por defecto (21 %).

**Transparencia**
- Desglose desplegable: base USD, franquicia, IVA, arancel, percepciones, cotización y hora.
- Aviso fijo "estimación, puede diferir del cargo final".
- No se envían datos del usuario a ningún servidor; solo consultas de cotización.

## 4. Pruebas y entrega

**Pruebas**
- `calc.js` (Vitest): dentro de franquicia, justo USD 400, excedente, cupo agotado, EUR, blue vs tarjeta, IVA reducido, entradas inválidas. Valores esperados calculados a mano.
- `parser.js`: HTML guardado de páginas reales de amazon.com y amazon.es (precio simple, rango, sin precio, "no se envía"), offline.
- `rates.js`: `fetch` simulado (caída, timeout, caché, discrepancia).
- Navegador real: extensión sin empaquetar en Chromium con Playwright/Patchright para verificar el bloque en una página real de cada tienda. Verificación manual asistida, no test permanente (Amazon detecta bots).
- JS plano con JSDoc, sin compilación.

**Entrega**
- Instalación con `chrome://extensions` → "Cargar descomprimida".
- `README.md` con instalación, edición de `rules.json` y ajustes.
- Commits por módulo: `calc`, `rates`, `parser`, `inject`, `options`.

## 5. Fuera de alcance (v1)
Otras tiendas Amazon; cálculo automático del cupo usado; detección de categoría (arancel e IVA reducido manuales); casilleros y warehouses (Bringit, Shipito); Firefox/Safari; publicación en la Web Store.

## 6. Riesgos
- Los selectores de Amazon cambian sin aviso: aislado en `parser`, con mantenimiento esperado.
- Las reglas impositivas no están verificadas contra ARCA: la primera tarea del plan es contrastarlas.
- Las percepciones de tarjeta cambian con la normativa: viven en `rules.json`.
