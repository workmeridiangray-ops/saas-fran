import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

/* ---------- Status label: icon + text, so meaning never depends on colour ---------- */
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";
const toneClass: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
};
const toneIcon: Record<Tone, LucideIcon> = { ok: CheckCircle2, warn: AlertTriangle, danger: XCircle, info: Info, neutral: Info };

export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>
      <Icon aria-hidden size={12} />
      {children}
    </span>
  );
}

/* ---------- Buttons ---------- */
const base = "inline-flex min-h-touch items-center justify-center gap-1 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const variants = {
  primary: "bg-brand text-white hover:bg-[#172E6E]",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-bg",
};
export function Button({ variant = "secondary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button {...p} className={`${base} ${variants[variant]} ${p.className ?? ""}`} />;
}
export function ButtonLink({ href, variant = "secondary", children }: { href: string; variant?: keyof typeof variants; children: React.ReactNode }) {
  return <Link href={href} className={`${base} ${variants[variant]}`}>{children}</Link>;
}

/* ---------- Page structure ---------- */
export function PageHeader({ title, description, actions, updated }: {
  title: string; description?: string; actions?: React.ReactNode; updated?: string;
}) {
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-0.5 max-w-prose text-sm text-muted">{description}</p>}
        {updated && <p className="mt-0.5 text-xs text-muted">Updated {updated}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-1">{actions}</div>}
    </header>
  );
}
export function Panel({ title, action, children, className = "" }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface shadow-raised ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-2 py-1 pl-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-2">{children}</div>
    </section>
  );
}

/* ---------- Metric: always links to the records behind it ---------- */
export function Metric({ label, value, href, note, tone = "neutral" }: {
  label: string; value: string; href: string; note: string; tone?: Tone;
}) {
  return (
    <Link href={href} className="block rounded-lg border border-line bg-surface p-2 shadow-raised hover:border-line-strong">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      <p className={`mt-0.5 text-xs ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted"}`}>{note}</p>
    </Link>
  );
}

/* ---------- Empty / restricted / limit states: what happened, what was saved, what next ---------- */
export function StateMessage({ icon: Icon = Info, title, children, actions }: {
  icon?: LucideIcon; title: string; children: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div role="status" className="mx-auto max-w-form rounded-lg border border-dashed border-line-strong bg-surface p-4 text-center">
      <Icon aria-hidden className="mx-auto text-muted" size={24} />
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-0.5 max-w-prose text-sm text-muted">{children}</p>
      {actions && <div className="mt-2 flex justify-center gap-1">{actions}</div>}
    </div>
  );
}
export function Alert({ tone, title, children }: { tone: Exclude<Tone, "neutral">; title: string; children?: React.ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-1 rounded-md p-2 text-sm ${toneClass[tone]}`}>
      <Icon aria-hidden size={16} className="mt-0.5 shrink-0" />
      <div><p className="font-semibold">{title}</p>{children && <div className="mt-0.5">{children}</div>}</div>
    </div>
  );
}

/* ---------- Table primitives (wide tables scroll inside their own region) ---------- */
export function TableWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto rounded-lg border border-line bg-surface shadow-raised">
      <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, num }: { children?: React.ReactNode; num?: boolean }) => (
  <th scope="col" className={`border-b border-line bg-sunken px-2 py-1 text-xs font-semibold text-muted ${num ? "text-right" : "text-left"}`}>{children}</th>
);
export const Td = ({ children, num, className = "" }: { children?: React.ReactNode; num?: boolean; className?: string }) => (
  <td className={`min-h-row border-b border-line px-2 py-1.5 align-middle ${num ? "num" : ""} ${className}`}>{children}</td>
);
