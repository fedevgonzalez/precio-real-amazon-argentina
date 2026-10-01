# Cuánto Me Sale en Argentina — para Amazon

Extensión de Chrome/Edge que muestra, **debajo de cada precio de amazon.com y amazon.es**, cuánto te sale de verdad la compra puesta en tu casa en Argentina: total con envío e impuestos de importación en USD (y en EUR en amazon.es) y ese total en pesos al dólar blue.

```
Total en EUR: ~EUR 56,37      ← solo amazon.es
Total + imp.: ~USD 64,01
Blue: ~ARS 99.852
```

- **amazon.com, página de producto:** el total es el que Amazon informa y cobra en el checkout (precio + envío + cargos de importación). Sin `~`.
- **Listas de búsqueda:** cada producto muestra su total; en amazon.com la extensión lo reemplaza por el total real leyendo la página de cada producto.
- **amazon.es:** Amazon descuenta el IVA de España antes de cobrar el envío a Argentina; la extensión lo modela. Es una estimación (`~`) que en los checkouts probados difiere un 0,4 %.
- **Popup:** desglose del producto abierto (precio, envío, franquicia de USD 400, arancel, IVA), cotizaciones usadas y avisos, más los ajustes.

> Estimación orientativa: lo que cobra Amazon en el checkout es lo que rige. Extensión independiente, hecha en Argentina; **no está afiliada ni avalada por Amazon**.

## Instalación (modo desarrollador)

1. Abrí `chrome://extensions` (o `edge://extensions`) y activá **Modo desarrollador**.
2. **Cargar descomprimida** y elegí esta carpeta.

## Ajustes

Clic en el ícono de la extensión:
- **Envíos usados este año:** el cupo es de 5 por año; al llegar a 5 se pierde la franquicia de USD 400.
- **Unidades iguales en el pedido:** más de 3 sale del régimen simplificado.
- **IVA reducido 10,5 %:** activalo solo si el producto lo tiene (notebooks, tablets y similares).

## Privacidad

No hay cuentas, servidores propios ni analítica. Ver [`privacy-policy.md`](privacy-policy.md).

## Desarrollo

- `npm install` y `npm test` (Vitest).
- Reglas impositivas en `src/core/rules.json`; su verificación y fuentes en `docs/rules-verification.md`.
- Si Amazon cambia su HTML, se tocan los selectores de `src/content/parser.js` y los `ANCHORS` de `src/content/inject.js`.
- Alcance: solo amazon.com y amazon.es, envío por courier a domicilio.

Licencia MIT.
