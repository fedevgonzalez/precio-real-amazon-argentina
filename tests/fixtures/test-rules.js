/** Reglas fijas para tests: no cambian si se actualiza rules.json. */
export const RULES = {
  franquiciaUsd: 400,
  cupoEnvios: 5,
  ivaGeneral: 0.21,
  ivaReducido: 0.105,
  arancelGeneral: 0.35,
  topeFobUsd: 3000,
  maxUnidades: 3,
  percepcionTarjeta: 0.3,
  cache: { minutos: 10, timeoutMs: 50, discrepanciaMax: 0.05 },
};
