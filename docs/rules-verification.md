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
| Percepción de tarjeta 30 % (Ganancias / Bienes Personales) | `percepcionTarjeta: 0.3` | RG ARCA 5617/2024 art. 6: https://www.argentina.gob.ar/normativa/nacional/norma-407430/texto ("alícuota del TREINTA POR CIENTO (30%)") | Sí (alícuota); la base se trata en la decisión 2 | Ninguna en rules.json |
| Impuesto PAIS | (no está en rules.json; correcto) | Ley 27.541 art. 35 vigente hasta el 22-12-2024 inclusive; ARCA: https://www.argentina.gob.ar/noticias/se-elimina-el-pago-cuenta-del-impuesto-pais-para-importaciones ("el próximo 22 de diciembre -inclusive- vence la vigencia del Impuesto PAIS"). La RG 5617/2024 deja solo la percepción del 30 % | Sí, con matiz: no fue derogado, venció por su plazo | Ninguna |

Fuente adicional: Decreto 604/2026 art. 3 deroga el art. 8 del Dec. 161/99 (tasa unificada del 50 % postal), lo que unifica Correo y Courier. Boletín Oficial: https://www.boletinoficial.gob.ar/detalleAviso/primera/344470/20260717 (aparece en resultados de búsqueda; el texto leído fue el de argentina.gob.ar).

Resultado: `rules.json` no requiere cambios. `npm test` no se corrió porque no se tocó el archivo.

## Decisión 1: arancel general por defecto

- Verificado: por encima de USD 400 (o del cupo) el excedente tributa "en el régimen general" (Dec. 1065/2024 y 604/2026). No hay una alícuota única: el derecho de importación depende de la posición NCM (Arancel Externo Común del Mercosur). El rango 0-35 % y la tasa de estadística de 3 % provienen de fuentes secundarias y NO están verificados oficialmente.
- Decisión: mantener `arancelGeneral: 0.35`. Es el techo del rango, así que la extensión sobreestima en vez de subestimar el costo. Los tests de la Tarea 3 ya usan ese valor.
- La UI debe indicar que es una estimación máxima y que el arancel real depende del producto.
- Fuera del modelo y no verificado: tasa de estadística 3 % sobre el excedente y percepciones de IVA/Ganancias del régimen general de importación. Quedan como limitación documentada.

## Decisión 2: base de la percepción de tarjeta

- RG 5617/2024 art. 6 aplica el 30 % "sobre el importe total de cada operación alcanzada", en pesos, para consumos en moneda extranjera con tarjeta emitida en Argentina (art. 1 incluye compras a distancia en moneda extranjera). La base es lo que efectivamente se paga con la tarjeta: el cargo de Amazon (precio + envío + impuestos que Amazon cobre).
- Los tributos aduaneros (derecho de importación, IVA de importación) no los cobra Amazon: los cobra el courier / Correo en pesos. Sobre ese pago no aplica la percepción del art. 6, salvo que una plataforma los cobre con tarjeta (la RG 5884/2026 permite al Correo acordar el pago anticipado con plataformas; no consta que Amazon lo haga).
- Conclusión: el spec (percepción sobre el total con impuestos) difiere de la norma y de la práctica. La percepción se aplica solo a precio + envío pagado a Amazon.
- No verificado: la cotización con la que el courier convierte los tributos a pesos. Solo se encontró la regla de la RG 5616 para facturación (divisa vendedor BNA del día hábil anterior), no específica de aduana. Se usa el dólar oficial como aproximación y se marca como estimación.
- No verificado: si el flete de Amazon integra el FOB o solo el valor CIF (base del IVA). Se mantiene el supuesto del plan y se marca como estimación.
- No verificado: que el courier cobre los tributos en pesos al entregar. Es consistente con las páginas de ARCA leídas (el Correo cobra tasas de servicio y guarda) y con que son obligaciones fiscales locales, pero no se leyó un artículo que lo diga expresamente.

## Cambio necesario en calc.js

El plan calcula `tarjetaArs = round(totalUsd * oficial * (1 + percepcionTarjeta))` con `totalUsd = fob + arancel + iva`. Debe cambiar:

1. `pagoAmazonUsd = fobUsd` (precio + envío cobrado por Amazon, lo que va a la tarjeta).
2. `tarjetaArs = round(pagoAmazonUsd * rates.oficial * (1 + rules.percepcionTarjeta))`. La percepción NO se aplica a arancel ni IVA.
3. `aduanaArs = round((arancelUsd + ivaUsd) * rates.oficial)`: tributos pagados en pesos al courier, sin percepción. Exponerlo como campo del resultado.
4. Costo final en ARS = `tarjetaArs + aduanaArs`. Si se sigue mostrando "costo a dólar blue", decidirlo en la Tarea 3 según el spec, pero la percepción se calcula siempre sobre `pagoAmazonUsd`.
5. Ajustar los tests de `tarjetaArs` en `tests/calc.test.js`. Ejemplo: fob 100 USD, oficial 1000, percepción 30 %: `tarjetaArs = 130000` (antes se calculaba sobre 121 USD: 157300) y `aduanaArs = 21000`.
6. Mostrar en la UI una nota: "Estimación; el arancel real depende del producto".
