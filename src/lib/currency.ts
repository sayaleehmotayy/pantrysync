// Currency detection and formatting utility

export interface CurrencyInfo {
  code: string;   // e.g. "EUR", "USD", "GBP"
  symbol: string; // e.g. "€", "$", "£"
  locale: string; // e.g. "en-US", "de-DE"
}

const CURRENCY_MAP: Record<string, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  CAD: { code: 'CAD', symbol: 'CA$', locale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  CHF: { code: 'CHF', symbol: 'CHF', locale: 'de-CH' },
  SEK: { code: 'SEK', symbol: 'kr', locale: 'sv-SE' },
  NOK: { code: 'NOK', symbol: 'kr', locale: 'nb-NO' },
  DKK: { code: 'DKK', symbol: 'kr', locale: 'da-DK' },
  PLN: { code: 'PLN', symbol: 'zł', locale: 'pl-PL' },
  CZK: { code: 'CZK', symbol: 'Kč', locale: 'cs-CZ' },
  JPY: { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  BRL: { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
  MXN: { code: 'MXN', symbol: 'MX$', locale: 'es-MX' },
  ZAR: { code: 'ZAR', symbol: 'R', locale: 'en-ZA' },
  NZD: { code: 'NZD', symbol: 'NZ$', locale: 'en-NZ' },
  SGD: { code: 'SGD', symbol: 'S$', locale: 'en-SG' },
  HKD: { code: 'HKD', symbol: 'HK$', locale: 'zh-HK' },
  KRW: { code: 'KRW', symbol: '₩', locale: 'ko-KR' },
  TRY: { code: 'TRY', symbol: '₺', locale: 'tr-TR' },
  AED: { code: 'AED', symbol: 'د.إ', locale: 'ar-AE' },
};

/** Detect currency from browser locale */
export function detectCurrencyFromLocale(): CurrencyInfo {
  try {
    const locale = navigator.language || 'en-US';
    // Use Intl to resolve the currency for the user's locale
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).resolvedOptions();
    // Map locale region to likely currency
    const region = locale.split('-')[1]?.toUpperCase() || '';
    const regionToCurrency: Record<string, string> = {
      US: 'USD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR',
      NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
      SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR',
      CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
      PL: 'PLN', CZ: 'CZK', JP: 'JPY', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR',
      SG: 'SGD', HK: 'HKD', KR: 'KRW', TR: 'TRY', AE: 'AED',
    };
    const code = regionToCurrency[region] || 'USD';
    return CURRENCY_MAP[code] || CURRENCY_MAP.USD;
  } catch {
    return CURRENCY_MAP.USD;
  }
}

/** Get currency info from a code string (e.g. from receipt_scans.currency) */
export function getCurrencyInfo(code?: string | null): CurrencyInfo {
  if (!code) return detectCurrencyFromLocale();
  const upper = code.toUpperCase();
  return CURRENCY_MAP[upper] || { code: upper, symbol: upper, locale: 'en-US' };
}

/** Format a number as currency */
export function formatCurrency(amount: number, currency: CurrencyInfo): string {
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency.symbol}${amount.toFixed(2)}`;
  }
}

/**
 * React hook for easy currency formatting using user's profile preference.
 * NOTE: Implemented in `src/hooks/useUserCurrency.ts`. Re-export here so
 * existing `import { useCurrency } from '@/lib/currency'` keeps working.
 */
export { useUserCurrency as useCurrencyInfo } from '@/hooks/useUserCurrency';

// Backwards-compatible useCurrency: returns { formatPrice, currency }
import { useUserCurrency } from '@/hooks/useUserCurrency';
export function useCurrency() {
  const userCurrency = useUserCurrency();

  const formatPrice = (amount: number, currencyCode?: string) => {
    const info = currencyCode ? getCurrencyInfo(currencyCode) : userCurrency;
    return formatCurrency(amount, info);
  };

  return { formatPrice, currency: userCurrency };
}
