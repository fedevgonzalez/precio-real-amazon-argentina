# Verificación de reglas impositivas

Fecha de verificación: 2026-09-29. Los valores de `src/core/rules.json` vinieron de impuestito.org (no oficial).
Método: WebFetch sobre las URLs listadas. Los fetch resumen la página con un modelo pequeño, así que "leído" significa
que el texto citado aparece en la respuesta del fetch.

## Tabla

| Regla | Valor en rules.json | Fuente oficial (URL) | ¿Coincide? | Acción |
|---|---|---|---|---|
| Franquicia USD 400 FOB por envío (exención de derecho de importación y tasa de estadística) | `franquiciaUsd: 400` | Decreto 604/2026, art. 80 sustituido de Dec. 1001/82: https://www.argentina.gob.ar/normativa/nacional/norma-427768/texto ; Decreto 1065/2024 art. 1: https://www.argentina.gob.ar/normativa/nacional/decreto-1065-2024-406688/texto ; ARCA: https://www.afip.gob.ar/envios-internacionales/courier/importacion/pequenios-envios.asp | Sí | Ninguna |
| Cupo de 5 envíos por año y por persona | `cupoEnvios: 5` | Mismas URLs (Dec. 604/2026 y 1065/2024, "máximo de CINCO (5) envíos por año y por persona"); ARCA: "sólo podrá utilizarse 5 veces por año calendario y por persona" | Sí | Ninguna |
| IVA general 21 % | `ivaGeneral: 0.21` | Ley 23.349 art. 28 (t.o. Dec. 280/97): https://archivo.consejo.org.ar/Bib_elect/BD_Dic/documentos/art28_IVA.htm ; t.o. en biblioteca ARCA: https://biblioteca.afip.gob.ar/cuadroslegislativos/getAdjunto.aspx?i=7833 . ARCA confirma que dentro de la franquicia se paga "solo IVA e impuestos internos": https://www.afip.gob.ar/envios-internacionales/puerta-a-puerta/monto.asp | Sí, con reserva: el texto del art. 28 se conoció por resultado de búsqueda (página del CPCECABA, no de ARCA); infoleg no cargó | Ninguna |
| IVA reducido 10,5 % (bienes con alícuota del 50 % de la general) | `ivaReducido: 0.105` | Ley 23.349 art. 28 (misma fuente). La lista de bienes alcanzados no fue leída | Parcial: la alícuota sí; qué productos aplican, no verificado | Ninguna; el usuario elige el toggle |
| Arancel general por defecto sobre el excedente | `arancelGeneral: 0.35` | Dec. 1065/2024 y 604/2026: el excedente "quedará sujeto al pago de los tributos que graven la importación para consumo en el régimen general" (URLs de arriba). La alícuota concreta depende de la posición NCM (AEC Mercosur); no se leyó una fuente oficial del rango 0-35 % | Parcial: el régimen general está verificado; el 35 % como techo, no | Mantener 0.35 como valor conservador, ver decisión 1 |
| Tope USD 3.000 FOB por envío | `topeFobUsd: 3000` | RG ARCA 5884/2026 art. 2 (Correo/puerta a puerta): https://www.argentina.gob.ar/normativa/nacional/norma-428387/texto ; PSP/Courier: https://www.afip.gob.ar/envios-internacionales/courier/importacion/pequenios-envios.asp ("inferior o igual a USD 3.000 por envío") | Sí | Ninguna |
| Máximo 3 unidades por especie | `maxUnidades: 3` | RG 5884/2026 art. 2 ("hasta TRES (3) unidades de la misma especie"); ARCA pequeños envíos (Courier) | Sí | Ninguna |
| Percepción de tarjeta 30 % (Ganancias / Bienes Personales) | (ya no se usa: la tarjeta no se muestra) | RG ARCA 5617/2024 art. 6: https://www.argentina.gob.ar/normativa/nacional/norma-407430/texto ("alícuota del TREINTA POR CIENTO (30%)") | Sí (alícuota); la base se trata en la decisión 2 | Ninguna en rules.json |
| Impuesto PAIS | (no está en rules.json; correcto) | Ley 27.541 art. 35 vigente hasta el 22-12-2024 inclusive; ARCA: https://www.argentina.gob.ar/noticias/se-elimina-el-pago-cuenta-del-impuesto-pais-para-importaciones ("el próximo 22 de diciembre -inclusive- vence la vigencia del Impuesto PAIS"). La RG 5617/2024 deja solo la percepción del 30 % | Sí, con matiz: no fue derogado, venció por su plazo | Ninguna |

Fuente adicional: Decreto 604/2026 art. 3 deroga el art. 8 del Dec. 161/99 (tasa unificada del 50 % postal), lo que unifica Correo y Courier. Boletín Oficial: https://www.boletinoficial.gob.ar/detalleAviso/primera/344470/20260717 (aparece en resultados de búsqueda; el texto leído fue el de argentina.gob.ar).

Resultado: `rules.json` no requiere cambios. `npm test` no se corrió porque no se tocó el archivo.

## Decisión 1: arancel general por defecto

- Verificado: por encima de USD 400 (o del cupo) el excedente tributa "en el régimen general" (Dec. 1065/2024 y 604/2026). No hay una alícuota única: el derecho de importación depende de la posición NCM (Arancel Externo Común del Mercosur). El rango 0-35 % y la tasa de estadística de 3 % provienen de fuentes secundarias y NO están verificados oficialmente.
- Decisión: mantener `arancelGeneral: 0.35`. Es el techo del rango, así que la extensión sobreestima en vez de subestimar el costo. Los tests de la Tarea 3 ya usan ese valor.
- La UI debe indicar que es una estimación máxima y que el arancel real depende del producto.
- Fuera del modelo y no verificado: tasa de estadística 3 % sobre el excedente y percepciones de IVA/Ganancias del régimen general de importación. Quedan como limitación documentada.

## Cómo se cobra realmente (actualizado 2026-09-30)

- **Amazon cobra todo junto en el checkout:** producto + envío + "cargos de importación" (capturas de Amazon: "Envío de AmazonGlobal", "Cargos estimados de importación", "Total"). Por eso **blue = total con impuestos × blue**, sin pagos aparte al courier. La cuenta con tarjeta (dólar oficial + 30 % de percepción, RG ARCA 5617/2024 art. 6) se descartó del producto: no se calcula ni se muestra.
- **Si la página trae el total de Amazon** (panel `#amazonGlobal_feature_div`, en amazon.com) la extensión lo usa tal cual: precio + "US$X de cargos de envío e importación". Comparación real: Baseus US$ 61,11 y Raycon US$ 143,57 coinciden con la estimación propia (IVA 21 % sobre precio + envío); un teclado de US$ 119,99 da US$ 150,74 en Amazon contra 145,19 propio, y una notebook de US$ 3.499,99 da US$ 4.910,19 contra 5.547,83 propio (arancel máximo de 35 %). Amazon aplica aranceles por categoría que la extensión no conoce.
- **Sin ese panel** (amazon.es, tarjetas de la lista de amazon.com hasta que se lee la página de cada producto) se usa la estimación propia y se marca con `~`.
- **amazon.es descuenta el IVA de España.** El precio publicado incluye el 21 % de IVA español; al enviar a Argentina (exportación) el checkout cobra "Productos" = precio ÷ 1,21, más envío, más "Cargos de importación" (≈ 21 % argentino sobre precio neto + envío). Dos checkouts reales lo confirman: 39,99 € → Productos 33,05 €, total 76,90 € (la estimación da 76,89 €); 89,99 € → Productos 74,37 €, total 126,16 € (la estimación da 126,69 €, +0,4 %). Límite: productos con IVA español reducido (libros 4 %, alimentos 10 %) se subestiman.
- **Cupo de 5 envíos y franquicia de USD 400:** siguen vigentes en la página oficial de ARCA. Nota del 2-jul-2026 (El Destape): ARCA proyecta eliminar el límite de 5 envíos y que los marketplaces (Amazon, en prueba piloto) cobren los impuestos al comprar; es un proyecto, no una norma vigente. Para saber cuántos envíos usaste: ARCA con clave fiscal, servicio "Courier - Envíos personales" (muestra "Cupo disponible para el período").
- **IVA reducido 10,5 %:** aplica a computadoras portátiles, notebooks, netbooks y tablets importadas (fuentes secundarias); la lista exacta depende de la posición arancelaria. Es un interruptor manual en el popup.
