// Textos de las notas/avisos del cálculo. Los muestra el popup; la página solo marca "⚠ Ver detalle".
const NOTE_TEXT = {
  STALE_RATES: (n) => `Cotización de hace ${n.minutes} min (no se pudo actualizar).`,
  RATES_DISCREPANCY: () => 'Las fuentes de cotización difieren más de 5 %.',
  ENVIO_NO_INCLUIDO: () => 'Envío no incluido en el cálculo.',
  ENVIO_CON_IMPORT_FEES: () => 'Amazon combina el envío con "import fees": envío no incluido para no duplicar impuestos.',
  FUERA_REGIMEN_SIMPLIFICADO: () => 'Fuera del régimen simplificado (tope USD 3.000 o más de 3 unidades): el cálculo es orientativo.',
};

export function noteText(n) {
  return NOTE_TEXT[n.code] ? NOTE_TEXT[n.code](n) : String(n.code);
}
