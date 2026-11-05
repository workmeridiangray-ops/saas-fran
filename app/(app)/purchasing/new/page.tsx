import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { saveRequisitionDraft, submitNewRequisition } from "../actions";
import { branchOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { Flash } from "@/components/ui/flash";
import { PageHeader, StateMessage, ButtonLink } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";

export const metadata = { title: "New requisition" };

export default async function NewRequisition({ searchParams }: { searchParams: Promise<{ supplier?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "purchasing", { action: "create", module: "purchasing", what: "purchase requests" }); if (denied) return denied;
  const { supplier, err } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => {
    const suppliers = await db.q<{ id: string; name: string }>("select id, name from suppliers where company_id = $1 and status = 'approved' order by name", [ctx.companyId]);
    const sid = supplier && suppliers.some((s) => s.id === supplier) ? supplier : null;
    return { suppliers, branches: await branchOptions(db, ctx.companyId), sid, items: sid ? await db.q<{ id: string; sku: string; name: string; unit: string; unit_price_minor: string; tax_bp: number }>("select id, sku, name, unit, unit_price_minor, tax_bp from catalog_items where supplier_id = $1 and status = 'active' order by name", [sid]) : [] };
  });
  if (d.suppliers.length === 0) return <StateMessage title="Add a supplier first" actions={<ButtonLink href="/purchasing?tab=suppliers" variant="primary">Suppliers & items</ButtonLink>}>Requisitions are raised against an approved supplier's catalogue.</StateMessage>;
  return (
    <>
      <PageHeader title="New requisition" description="Choose a supplier to see its catalogue, then enter quantities." />
      <Flash err={err} />
      <FormCard title="1. Supplier"><form className="flex items-end gap-1"><div className="flex-1"><Select label="Supplier" name="supplier" defaultValue={d.sid ?? ""} placeholder="Choose…" options={d.suppliers.map((s) => ({ value: s.id, label: s.name }))} /></div><button className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Show items</button></form></FormCard>
      {d.sid && (
        <FormCard title="2. Items" className="mt-3 max-w-prose">
          <form className="space-y-2">
            <input type="hidden" name="supplier_id" value={d.sid} />
            <Select label="Deliver to branch" name="branch_id" options={d.branches.map((b) => ({ value: b.id, label: b.name }))} />
            {d.items.length === 0 ? <p className="text-sm text-muted">This supplier has no items yet. <Link className="font-medium text-brand" href="/purchasing?tab=suppliers">Add some</Link>.</p> : (
              <ul className="divide-y divide-line">{d.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-1"><label htmlFor={`q-${i.id}`} className="text-sm"><span className="font-medium">{i.name}</span><span className="block text-xs text-muted">{i.sku} · {formatMinor(Number(i.unit_price_minor), ctx.company.currency)} per {i.unit}{i.tax_bp ? ` + ${(i.tax_bp / 100).toFixed(1)}% tax` : ""}</span></label>
                  <input id={`q-${i.id}`} name={`qty:${i.id}`} type="number" min="0" step="0.001" placeholder="0" className="num min-h-touch w-[6rem] rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></li>))}</ul>)}
            <Field label="Note for the approver" name="note" />
            <div className="flex flex-wrap gap-1"><button formAction={submitNewRequisition} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Submit for approval</button><button formAction={saveRequisitionDraft} className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Save as draft</button></div>
          </form>
        </FormCard>)}
    </>
  );
}
