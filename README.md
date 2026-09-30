# Precio real Amazon Argentina

Extensión de Chrome/Edge que muestra, en amazon.com y amazon.es, el costo final en pesos argentinos (dólar blue y tarjeta) con los impuestos de importación por courier.

> Estimación orientativa. Las reglas están en `src/core/rules.json` y su verificación en `docs/rules-verification.md`.

## Instalación

1. `npm install` (solo para correr los tests).
2. Abrí `chrome://extensions` (o `edge://extensions`) y activá **Modo desarrollador**.
3. **Cargar descomprimida** → elegí esta carpeta.

## Uso

Abrí un producto en amazon.com o amazon.es: aparece el bloque "Precio real en Argentina" debajo del precio, con blue, tarjeta, la opción más barata y un desglose desplegable.

El bloque de la página muestra solo **Total + impuestos (USD)** y **Blue (ARS)**; si algo puede cambiar el número (envío desconocido, cotización vieja, fuera del régimen simplificado) agrega `⚠ Ver detalle en la extensión`. El detalle completo del producto abierto (desglose, cotizaciones, avisos) está en el popup de la extensión.

En las **páginas de resultados de búsqueda** (`/s?k=...`) cada producto muestra un renglón `Total + imp.: USD x · Blue: ARS y`; el `~` delante de los montos indica que el envío no está incluido (Amazon no lo informó).

## Ajustes

Clic en el ícono de la extensión:
- **Envíos ya usados este año:** cupo de 5 envíos por año. Al llegar a 5 se pierde la franquicia.
- **Unidades de la misma especie:** más de 3 sale del régimen simplificado.
- **IVA reducido:** activalo solo si sabés que el producto lo tiene.

## Actualizar las reglas

Editá `src/core/rules.json` (franquicia, alícuotas, percepción de tarjeta) y recargá la extensión. Detalle de cada valor y su fuente en `docs/rules-verification.md`.

## Desarrollo

- `npm test` corre los tests (Vitest).
- Si Amazon cambia su HTML, se tocan los selectores de `src/content/parser.js` y los `ANCHORS` de `src/content/inject.js`; los tests usan fragmentos de HTML en `tests/parser.test.js`.

## Alcance

Solo amazon.com y amazon.es, envío por courier a domicilio. Fuera de alcance: otras tiendas Amazon, casilleros, cálculo automático del cupo, detección de categoría, Firefox/Safari.

El cálculo separa lo que cobra Amazon (blue, o tarjeta con la percepción del 30 % sobre precio + envío) de los tributos aduaneros (arancel + IVA), que se pagan en pesos al courier al dólar oficial, sin percepción; ver `docs/rules-verification.md`.

## Privacidad y licencia

Política de privacidad: [`privacy-policy.md`](privacy-policy.md). Licencia MIT.
