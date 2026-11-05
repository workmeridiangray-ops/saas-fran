/** Custom fields and terminology (configuration studio). Pure: the database repeats these checks. */
export const ENTITIES = ["branches", "tasks", "tickets"] as const;
export type Entity = (typeof ENTITIES)[number];
export const KINDS = ["text", "number", "date", "select", "checkbox"] as const;
export type Kind = (typeof KINDS)[number];
export interface FieldDef { key: string; label: string; kind: Kind; options: string[]; required: boolean }
export const ENTITY_LABEL: Record<Entity, string> = { branches: "Branches", tasks: "Tasks", tickets: "Tickets" };
export const KIND_LABEL: Record<Kind, string> = { text: "Text", number: "Number", date: "Date", select: "Choice from a list", checkbox: "Yes / no" };

/** A stable key from a label: "Seating capacity" -> "seating_capacity". */
export function keyFromLabel(label: string): string {
  const k = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  return /^[a-z]/.test(k) ? k : `f_${k}`.slice(0, 30);
}
export const inputName = (key: string) => `cf_${key}`;

export type CustomValues = Record<string, string | number | boolean>;
/** Read the custom values out of a submitted form and check them against the definitions. Empty optional fields are left out. */
export function parseCustom(defs: FieldDef[], get: (name: string) => string | null): { values: CustomValues; error?: string } {
  const values: CustomValues = {};
  for (const d of defs) {
    const raw = (get(inputName(d.key)) ?? "").trim();
    if (d.kind === "checkbox") { values[d.key] = raw === "on" || raw === "true"; continue; }
    if (raw === "") { if (d.required) return { values, error: `${d.label} is required.` }; continue; }
    if (d.kind === "number") { const n = Number(raw); if (!Number.isFinite(n)) return { values, error: `${d.label} must be a number.` }; values[d.key] = n; }
    else if (d.kind === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return { values, error: `${d.label} must be a date.` }; values[d.key] = raw; }
    else if (d.kind === "select") { if (!d.options.includes(raw)) return { values, error: `${d.label}: choose one of the listed options.` }; values[d.key] = raw; }
    else { if (raw.length > 500) return { values, error: `${d.label} is too long (500 characters at most).` }; values[d.key] = raw; }
  }
  return { values };
}
/** Show a stored value as text. */
export function showValue(d: FieldDef, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (d.kind === "checkbox") return v === true ? "Yes" : "No";
  return String(v);
}
export function parseOptions(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}
