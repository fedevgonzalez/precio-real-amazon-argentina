/** Cálculo puro del costo final en ARS. Sin DOM ni red. Ver typedefs en el plan (Tarea 3). */
export function calc(item, rates, settings, rules) {
  const { precio, envio = 0, moneda } = item ?? {};
  const valid =
    Number.isFinite(precio) && precio > 0 &&
    Number.isFinite(envio) && envio >= 0 &&
    (moneda === 'USD' || moneda === 'EUR');
  if (!valid) return { ok: false, error: 'INVALID_INPUT' };

  const pos = (v) => Number.isFinite(v) && v > 0;
  if (!pos(rates?.blue) || !pos(rates?.oficial) || (moneda === 'EUR' && !pos(rates.eurUsd))) {
    return { ok: false, error: 'NO_RATES' };
  }

  const { enviosUsados = 0, ivaReducido = false, unidades = 1 } = settings ?? {};
  const fobUsd = (precio + envio) * (moneda === 'EUR' ? rates.eurUsd : 1);
  const conCupo = enviosUsados < rules.cupoEnvios;
  const franquiciaAplicadaUsd = conCupo ? Math.min(fobUsd, rules.franquiciaUsd) : 0;
  const arancelUsd = (fobUsd - franquiciaAplicadaUsd) * rules.arancelGeneral;
  const ivaUsd = (fobUsd + arancelUsd) * (ivaReducido ? rules.ivaReducido : rules.ivaGeneral);
  const totalUsd = fobUsd + arancelUsd + ivaUsd;

  // Tributos aduaneros: se pagan en pesos al courier (dólar oficial, sin percepción de tarjeta).
  const aduanaUsd = arancelUsd + ivaUsd;
  const aduanaArs = Math.round(aduanaUsd * rates.oficial);
  // Lo que cobra Amazon (precio + envío): blue = USD comprados al blue; tarjeta = oficial + percepción.
  // Un solo redondeo por total: se suma sin redondear los pasos intermedios.
  const blueArs = Math.round(fobUsd * rates.blue + aduanaUsd * rates.oficial);
  const tarjetaArs = Math.round(fobUsd * rates.oficial * (1 + rules.percepcionTarjeta) + aduanaUsd * rates.oficial);

  const avisos = [];
  if (fobUsd > rules.topeFobUsd || unidades > rules.maxUnidades) avisos.push('FUERA_REGIMEN_SIMPLIFICADO');

  return {
    ok: true,
    fobUsd, franquiciaAplicadaUsd, arancelUsd, ivaUsd, totalUsd,
    pagoAmazonUsd: fobUsd, aduanaArs,
    blueArs, tarjetaArs,
    masBarata: blueArs <= tarjetaArs ? 'blue' : 'tarjeta',
    avisos,
  };
}
