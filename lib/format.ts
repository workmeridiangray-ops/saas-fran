export const fmtDate = (v: string | Date | null | undefined, tz?: string) =>
  v ? new Date(v).toLocaleDateString("en-GB", { dateStyle: "medium", ...(tz ? { timeZone: tz } : {}) }) : "—";
export const fmtDateTime = (v: string | Date | null | undefined, tz?: string) =>
  v ? new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) }) : "—";
export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
/** <input type="datetime-local"> value interpreted in a given zone -> ISO instant. */
export function zonedToIso(local: string, tz: string): string {
  const [d, t = "00:00"] = local.split("T"); const [y, mo, da] = d!.split("-").map(Number); const [h, mi] = t.split(":").map(Number);
  const guess = Date.UTC(y!, mo! - 1, da!, h!, mi!);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const g = (k: string) => Number(parts.find((p) => p.type === k)!.value);
  const asLocal = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asLocal - guess)).toISOString();
}
