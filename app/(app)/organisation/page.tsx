import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addOrgItem, setPartnerStage, toggleOrgItem } from "./actions";
import { Field } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status } from "@/components/ui";

export const metadata = { title: "Organisation" };
const SECTIONS = [
  { kind: "brands", title: "Brands", table: "brands", hint: "Optional. A concept the company operates.", partner: false },
  { kind: "regions", title: "Regions", table: "regions", hint: "Optional. A management grouping, such as East.", partner: false },
  { kind: "entities", title: "Legal entities", table: "legal_entities", hint: "Optional. Companies responsible for contracts and billing.", partner: false },
  { kind: "departments", title: "Departments", table: "departments", hint: "Optional. Kitchen, accounts, sales…", partner: false },
  { kind: "partners", title: "Franchise partners", table: "franchise_partners", hint: "Independent operators. A prospect is not an active partner.", partner: true },
] as const;
const STAGES = ["prospect", "approved", "active", "renewing", "terminated"];

export default async function Organisation({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "organisation", { what: "the organisation" }); if (denied) return denied;
  const { ok, err } = await searchParams;
  const fk: Record<string, string> = { brands: "brand_id", regions: "region_id", entities: "legal_entity_id", partners: "partner_id" };
  type Row = { id: string; name: string; status: string; stage?: string; n: string };
  const data: Record<string, Row[]> = {};
  await asUser(ctx.user.id, async (db) => {
    for (const s of SECTIONS) {
      const count = fk[s.kind] ? `(select count(*) from branches b where b.${fk[s.kind]} = t.id)` : "0";
      data[s.kind] = await db.q<Row>(`select t.id, t.name, t.status, ${s.partner ? "t.stage," : ""} ${count} as n from ${s.table} t where t.company_id = $1 order by t.status, t.name`, [ctx.companyId]);
    }
  });
  const canAdd = ctx.has("create", "organisation");
  return (
    <>
      <PageHeader title="Organisation" description="Everything here is optional. A company with three branches doesn't need regions, brands or partners." />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-2">
        {SECTIONS.map((s) => {
          const rows = data[s.kind] ?? [];
          return (
            <Panel key={s.kind} title={s.title}>
              <p className="mb-1 text-xs text-muted">{s.hint}</p>
              {rows.length === 0 ? <p className="py-1 text-sm text-muted">None yet.</p> : (
                <ul className="divide-y divide-line">{rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-1 py-1 text-sm">
                    <span className={r.status === "archived" ? "text-muted line-through" : "font-medium"}>{r.name}{s.kind !== "departments" && <span className="ml-1 text-xs font-normal text-muted">{r.n} branch{r.n === "1" ? "" : "es"}</span>}</span>
                    <span className="flex items-center gap-1">
                      {s.partner && canAdd && <form action={setPartnerStage} className="flex gap-0.5"><input type="hidden" name="id" value={r.id} />
                        <select name="stage" defaultValue={r.stage} aria-label={`Stage for ${r.name}`} className="min-h-touch rounded-md border border-line-strong bg-surface px-1 text-xs">{STAGES.map((x) => <option key={x}>{x}</option>)}</select><SubmitButton variant="secondary" pending="…">Set</SubmitButton></form>}
                      {r.status === "archived" && <Status tone="neutral">Archived</Status>}
                      {canAdd && <form action={toggleOrgItem}><input type="hidden" name="kind" value={s.kind} /><input type="hidden" name="id" value={r.id} /><SubmitButton variant="secondary" pending="…">{r.status === "active" ? "Archive" : "Restore"}</SubmitButton></form>}
                    </span>
                  </li>))}</ul>
              )}
              {canAdd && <form action={addOrgItem} className="mt-2 flex items-end gap-1"><input type="hidden" name="kind" value={s.kind} /><div className="flex-1"><Field label={`Add ${s.title.toLowerCase().replace(/s$/, "")}`} name="name" required /></div><SubmitButton pending="Adding…">Add</SubmitButton></form>}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
