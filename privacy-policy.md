# Política de privacidad — Precio real Amazon Argentina

Última actualización: 30 de septiembre de 2026

Esta extensión muestra, dentro de amazon.com y amazon.es, el precio final estimado para una compra con envío a Argentina: total con impuestos en USD (y en EUR en amazon.es) y su equivalente en pesos al dólar blue.

**Resumen: no recolectamos, guardamos en servidores propios ni compartimos datos personales. La extensión no tiene servidores, cuentas, publicidad ni analítica.**

## Qué datos usa la extensión y dónde quedan

| Dato | Para qué | Dónde queda |
|---|---|---|
| Precio, envío y cargos de importación de las páginas de Amazon que abrís | Calcular el total | Solo en tu navegador; se lee en el momento y no se envía a ningún lado |
| Tus ajustes: envíos usados en el año, unidades, IVA reducido | Ajustar el cálculo | `chrome.storage.sync` (se sincroniza con tu cuenta de Google/Chrome si tenés la sincronización activada) |
| Cotizaciones (dólar blue, EUR/USD) y totales ya calculados por producto, con su fecha | Evitar pedirlos de nuevo | `chrome.storage.local`, solo en tu equipo; se vencen solos (6 horas los totales) y se limitan en cantidad |

No se guardan tu historial de navegación, tus compras, tus datos de Amazon, tu dirección ni ninguna cookie o credencial.

## Conexiones de red

- **Servicios de cotización:** para obtener el dólar blue y el tipo de cambio EUR/USD la extensión consulta `dolarapi.com`, `api.bluelytics.com.ar`, `api.frankfurter.dev` y `open.er-api.com`. Son pedidos públicos sin datos tuyos; como en cualquier pedido web, esos servicios ven tu dirección IP.
- **Amazon:** en las listas de búsqueda de amazon.com, la extensión abre en segundo plano la página de cada producto (hasta 40 por página) desde tu propia sesión, para leer el total real que Amazon informa. Es el mismo tipo de pedido que hace tu navegador al abrir esos productos.

La extensión no envía información a ningún otro destino.

## Permisos

- `storage`: guardar tus ajustes y la caché descriptos arriba.
- Acceso a `amazon.com` y `amazon.es`: leer los precios de las páginas que abrís y mostrar el cálculo.
- Acceso a los cuatro servicios de cotización nombrados: obtener los tipos de cambio.

## Aviso

Los valores son estimaciones orientativas. Lo que cobra Amazon en el checkout es lo que rige. Esta extensión es independiente y **no está afiliada, asociada ni respaldada por Amazon**; "Amazon" es una marca de sus titulares.

## Cambios y contacto

Si esta política cambia, se actualiza la fecha de arriba. Contacto: abrí un issue en https://github.com/fedevgonzalez/precio-real-amazon-argentina/issues.
