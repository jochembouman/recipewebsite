// Turns raw (scaled) amounts into readable quantities. Shared by the server
// render and the servings scaler in the browser, so both always agree.

/** Units that read best as rounded decimals (200 g, 1,5 l) instead of fractions. */
const DECIMAL_UNITS = new Set(['g', 'gr', 'gram', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'liter', 'litre']);
const LARGE_UNITS = new Set(['kg', 'l', 'liter', 'litre']);

const FRACTIONS: Array<[number, string]> = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
];

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function metricStep(value: number, unit: string): number {
  if (LARGE_UNITS.has(unit)) return value < 1 ? 0.05 : 0.1;
  if (value < 10) return 0.5;
  if (value < 50) return 1;
  if (value < 250) return 5;
  if (value < 1000) return 10;
  return 50;
}

function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(value);
}

function formatFraction(value: number, locale: string): string {
  // Above 10 a fraction smaller than a half is noise: 12 eggs, not 12⅛.
  const candidates = value >= 10 ? FRACTIONS.filter(([f]) => f === 0 || f === 0.5 || f === 1) : FRACTIONS;
  let whole = Math.floor(value);
  const rest = value - whole;
  let [fraction, symbol] = candidates.reduce((best, current) =>
    Math.abs(current[0] - rest) < Math.abs(best[0] - rest) ? current : best,
  );
  if (fraction === 1) {
    whole += 1;
    symbol = '';
  }
  // Never round a small amount away entirely.
  if (whole === 0 && symbol === '') symbol = '⅛';
  return `${whole > 0 ? formatDecimal(whole, locale) : ''}${symbol}`;
}

export function formatQuantity(value: number, unit: string | undefined, locale: string): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const normalizedUnit = unit?.trim().toLowerCase() ?? '';
  if (DECIMAL_UNITS.has(normalizedUnit)) {
    const step = metricStep(value, normalizedUnit);
    return formatDecimal(Math.max(step, roundTo(value, step)), locale);
  }
  return formatFraction(value, locale);
}
