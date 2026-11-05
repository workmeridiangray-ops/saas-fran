import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { DATASETS, columnCatalog, isDataset, validateSpec, MAX_COLUMNS, type Dataset } from "@/lib/rules/report-builder";
import { loadFields } from "@/lib/studio";
import { runSpec } from "@/lib/reports-custom";
import { saveCustomReport } from "../custom-actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { titleCase } from "@/lib/format";

export const metadata = { title: "Report builder" };
type SP = { dataset?: string; col?: string | string[]; status?: string; from?: string; to?: string; sort?: string; dir?: string; go?: string; err?: string };

export default async function Builder({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "reports", { what: "reports" }); if (denied) return denied;
  const sp = await searchParams; const dataset: Dataset = isDataset(sp.dataset ?? "") ? (sp.dataset as Dataset) : "tasks";
  const def = DATASETS[dataset]; const canExport = ctx.has("export", def.resource);
  const cols = sp.col === undefined ? [] : Array.isArray(sp.col) ? sp.col : [sp.col];
  const custom = await asUser(ctx.user.id, (db) => loadFields(db, ctx.companyId, dataset));
  const catalog = columnCatalog(dataset, custom);
  const spec = { dataset, columns: cols, filters: { status: sp.status || undefined, from: sp.from || undefined, to: sp.to || undefined }, sort: sp.sort || undefined, desc: sp.dir === "desc" };
  const problem = sp.go ? validateSpec(spec, custom) : null;
  const preview = sp.go && !problem && canExport ? await runSpec(ctx.user.id, ctx.companyId, spec, 25) : null;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/reports" className="text-brand underline">Reports</Link> / Builder</nav>
      <PageHeader title="Report builder" description="Choose what to report on, pick your columns and filters, preview it, then save it to reuse and download." />
      <Flash err={sp.err ?? problem ?? undefined} />
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Report about">
        {(Object.keys(DATASETS) as Dataset[]).map((k) => <Link key={k} href={`/reports/builder?dataset=${k}`} aria-current={k === dataset ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${k === dataset ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>{DATASETS[k].label}</Link>)}
      </div>
      {!canExport ? <Panel title="No access"><p className="text-sm">You don&apos;t have permission to export {def.label.toLowerCase()}.</p></Panel> : (
        <FormCard title={`${def.label} report`}>
          <form method="get" action="/reports/builder" role="search" className="space-y-2">
            <input type="hidden" name="dataset" value={dataset} /><input type="hidden" name="go" value="1" />
            <fieldset><legend className="mb-0.5 text-sm font-medium">Columns <span className="font-normal text-muted">(up to {MAX_COLUMNS})</span></legend>
              <div className="grid gap-x-3 sm:grid-cols-2">{catalog.map((c) => <label key={c.id} className="flex min-h-touch items-center gap-1.5 text-sm"><input type="checkbox" name="col" value={c.id} defaultChecked={cols.includes(c.id)} className="h-2 w-2" />{c.label}</label>)}</div></fieldset>
            <div className="grid gap-2 sm:grid-cols-3">
              <Select label="Only show status" name="status" placeholder="Any" options={def.statuses.map((s) => ({ value: s, label: titleCase(s) }))} defaultValue={sp.status ?? ""} />
              <Field label="From (date added)" name="from" type="date" defaultValue={sp.from ?? ""} /><Field label="To" name="to" type="date" defaultValue={sp.to ?? ""} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select label="Sort by" name="sort" placeholder="Newest first" options={catalog.map((c) => ({ value: c.id, label: c.label }))} defaultValue={sp.sort ?? ""} />
              <Select label="Order" name="dir" options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} defaultValue={sp.dir ?? "asc"} />
            </div>
            <SubmitButton pending="Running…">Preview</SubmitButton>
          </form>
        </FormCard>)}
      {preview && (
        <div className="mt-3 space-y-3">
          <Panel title={`Preview (first ${Math.min(25, preview.rows.length)} rows)`}>
            {preview.rows.length === 0 ? <p className="text-sm text-muted">Nothing matches these filters.</p> : (
              <TableWrap label="Report preview"><thead><tr>{preview.headers.map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>{preview.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <Td key={j}>{v === null || v === undefined ? "—" : v instanceof Date ? v.toISOString().slice(0, 16).replace("T", " ") : String(v)}</Td>)}</tr>)}</tbody></TableWrap>)}
          </Panel>
          {ctx.has("create", "reports") && (
            <FormCard title="Save this report">
              <form action={saveCustomReport} className="space-y-2">
                <input type="hidden" name="dataset" value={dataset} />{spec.columns.map((c) => <input key={c} type="hidden" name="col" value={c} />)}
                <input type="hidden" name="status" value={sp.status ?? ""} /><input type="hidden" name="from" value={sp.from ?? ""} /><input type="hidden" name="to" value={sp.to ?? ""} /><input type="hidden" name="sort" value={sp.sort ?? ""} /><input type="hidden" name="dir" value={sp.dir ?? "asc"} />
                <Field label="Report name" name="name" required maxLength={80} /><SubmitButton pending="Saving…">Save report</SubmitButton>
              </form>
            </FormCard>)}
        </div>)}
    </>
  );
}
