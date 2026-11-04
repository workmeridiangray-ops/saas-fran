/**
 * Money is integer minor units (e.g. cents) everywhere. Never floats.
 * Ledger kinds keep the two payment relationships apart (brief §17):
 *  - "saas_subscription": a company pays the platform
 *  - "franchise_royalty": a franchise partner pays its brand
 */
export type Minor = number;
export type LedgerKind = "saas_subscription" | "franchise_royalty";

export type ParseResult = { ok: true; value: Minor } | { ok: false; error: string };

/** Parse what a user typed. Too many decimals is an error; we never round input. */
export function parseMinor(input: string, decimals = 2): ParseResult {
  const s = input.trim().replace(/,/g, "");
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, error: "Enter an amount such as 1250.00" };
  const frac = m[3] ?? "";
  if (frac.length > decimals) return { ok: false, error: `Use at most ${decimals} decimal places` };
  const whole = Number(m[2]);
  const value = whole * 10 ** decimals + Number(frac.padEnd(decimals, "0") || "0");
  if (!Number.isSafeInteger(value)) return { ok: false, error: "Amount is too large" };
  return { ok: true, value: m[1] ? -value : value };
}

export function formatMinor(value: Minor, currency: string, locale = "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value / 100);
}

/** value * rateBp / 10_000, rounded half away from zero, in integers only. */
export function applyBasisPoints(value: Minor, rateBp: number): Minor {
  const num = value * rateBp;
  const q = Math.trunc(num / 10_000);
  const r = Math.abs(num % 10_000);
  return r * 2 >= 10_000 ? q + Math.sign(num || 1) : q;
}
