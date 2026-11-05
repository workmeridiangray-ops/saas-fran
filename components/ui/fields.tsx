import { useId } from "react";

const input = "min-h-touch w-full rounded-md border border-line-strong bg-surface px-1.5 text-sm placeholder:text-muted";

export function Field({ label, name, hint, error, required, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string; error?: string }) {
  const id = `f-${name}-${useId().replace(/:/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-sm font-medium">{label}{required && <span className="text-danger"> *</span>}</label>
      <input id={id} name={name} required={required} aria-describedby={hint ? `${id}-h` : undefined} aria-invalid={error ? true : undefined} className={input} {...rest} />
      {hint && <p id={`${id}-h`} className="mt-0.5 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-0.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
export function TextArea({ label, name, hint, rows = 3, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: string }) {
  const id = `f-${name}-${useId().replace(/:/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-sm font-medium">{label}</label>
      <textarea id={id} name={name} rows={rows} className="w-full rounded-md border border-line-strong bg-surface p-1.5 text-sm" {...rest} />
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function Select({ label, name, options, hint, placeholder, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; name: string; options: { value: string; label: string }[]; hint?: string; placeholder?: string;
}) {
  const id = `f-${name}-${useId().replace(/:/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-sm font-medium">{label}</label>
      <select id={id} name={name} className={input} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function FormCard({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`max-w-form rounded-lg border border-line bg-surface p-3 shadow-raised ${className}`}>
      {title && <h2 className="mb-2 text-lg font-semibold">{title}</h2>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}
