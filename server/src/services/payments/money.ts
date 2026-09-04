import { getSettings } from '../settings.service.js';

/** Currencies whose smallest unit is the unit itself (no cents). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XAF', 'XOF', 'UGX', 'RWF']);

export function minorUnits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

/** "1250.50" or 1250.5 → 125050 minor units. Rejects anything non-finite. */
export function toMinor(amount: number | string, currency: string): number {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid amount');
  return Math.round(value * minorUnits(currency));
}

export function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / minorUnits(currency);
}

export function formatMoney(amountMinor: number, currency?: string): string {
  const code = (currency ?? getSettings().payments.currency).toUpperCase();
  const value = fromMinor(amountMinor, code);
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: minorUnits(code) === 1 ? 0 : 2,
    }).format(value);
  } catch {
    // Unknown or custom currency code — fall back to a plain formatted number.
    return `${code} ${value.toFixed(minorUnits(code) === 1 ? 0 : 2)}`;
  }
}
