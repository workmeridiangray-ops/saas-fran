/** Line totals in integer minor units. qty has up to 3 decimals; BigInt avoids float error. */
export function lineTotalMinor(qty: number, unitPriceMinor: number, taxBp = 0): number {
  const q = BigInt(Math.round(qty * 1000));
  const net = (q * BigInt(unitPriceMinor) + 500n) / 1000n;
  const tax = (net * BigInt(taxBp) + 5000n) / 10000n;
  return Number(net + tax);
}
export function requisitionTotal(lines: { qty: number; unitPriceMinor: number; taxBp?: number }[]): number {
  return lines.reduce((n, l) => n + lineTotalMinor(l.qty, l.unitPriceMinor, l.taxBp ?? 0), 0);
}
