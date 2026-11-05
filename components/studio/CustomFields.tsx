import { Field, Select } from "@/components/ui/fields";
import { inputName, type CustomValues, type FieldDef } from "@/lib/rules/studio";

/** Renders the company's own fields for a record form. Values come back as cf_<key> inputs. */
export function CustomFields({ defs, values = {} }: { defs: FieldDef[]; values?: CustomValues }) {
  if (defs.length === 0) return null;
  return (
    <fieldset className="space-y-2 rounded-md border border-line p-2">
      <legend className="px-0.5 text-sm font-medium">Additional details</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {defs.map((d) => {
          const name = inputName(d.key); const v = values[d.key];
          if (d.kind === "select") return <Select key={d.key} label={`${d.label}${d.required ? " *" : ""}`} name={name} options={d.options.map((o) => ({ value: o, label: o }))} placeholder="Choose…" defaultValue={typeof v === "string" ? v : ""} />;
          if (d.kind === "checkbox") return <label key={d.key} className="flex min-h-touch items-center gap-1.5 text-sm"><input type="checkbox" name={name} defaultChecked={v === true} className="h-2 w-2" />{d.label}</label>;
          return <Field key={d.key} label={d.label} name={name} required={d.required} type={d.kind === "number" ? "number" : d.kind === "date" ? "date" : "text"} step={d.kind === "number" ? "any" : undefined} defaultValue={v === undefined ? "" : String(v)} />;
        })}
      </div>
    </fieldset>
  );
}
