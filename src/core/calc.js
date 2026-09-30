/** Cálculo puro del costo final en ARS. Sin DOM ni red. Ver typedefs en el plan (Tarea 3). */
export function calc(item, rates, settings, rules) {
  const { precio, envio = 0, moneda, amazonTotal } = item ?? {};
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
  // Amazon cobra producto + envío + cargos de importación juntos en el checkout: si la página informa su
  // total (amazonTotal, en la moneda del item), es lo que realmente se paga; si no, la estimación propia.
  const conv = moneda === 'EUR' ? rates.eurUsd : 1;
  const usaAmazon = Number.isFinite(amazonTotal) && amazonTotal > 0;
  const totalUsd = usaAmazon ? amazonTotal * conv : fobUsd + arancelUsd + ivaUsd;

  // Blue = esos USD comprados al blue; tarjeta = dólar oficial + percepción. Un solo redondeo por total.
  const blueArs = Math.round(totalUsd * rates.blue);
  const tarjetaArs = Math.round(totalUsd * rates.oficial * (1 + rules.percepcionTarjeta));

  const avisos = [];
  if (fobUsd > rules.topeFobUsd || unidades > rules.maxUnidades) avisos.push('FUERA_REGIMEN_SIMPLIFICADO');

  return {
    ok: true,
    fobUsd, franquiciaAplicadaUsd, arancelUsd, ivaUsd, totalUsd,
    fuente: usaAmazon ? 'amazon' : 'estimado',
    blueArs, tarjetaArs,
    masBarata: blueArs <= tarjetaArs ? 'blue' : 'tarjeta',
    avisos,
  };
}
