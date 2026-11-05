import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { moveBranch, updateBranch } from "../actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { BRANCH_LABEL, nextBranchStates, type BranchStatus } from "@/lib/rules/branch-lifecycle";
import { fmtDateTime } from "@/lib/format";

const TONE: Record<BranchStatus, Tone> = { planned: "neutral", opening: "info", active: "ok", suspended: "warn", closing: "warn", closed: "neutral" };

export default async function BranchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "branches", { what: "branches" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const b = await db.one<{ id: string; name: string; code: string; status: BranchStatus; ownership: string; timezone: string; address: { line1?: string; phone?: string }; brand_id: string | null; region_id: string | null; legal_entity_id: string | null; partner: string | null; created_at: string }>(
      "select b.*, p.name partner from branches b left join franchise_partners p on p.id = b.partner_id where b.id = $1", [id]);
    if (!b) return null;
    return {
      b,
      history: await db.q<{ valid_from: string; status: string; region: string | null; brand: string | null }>(
        "select h.valid_from, h.status, r.name region, br.name brand from branch_history h left join regions r on r.id = h.region_id left join brands br on br.id = h.brand_id where h.branch_id = $1 order by h.id desc limit 20", [id]),
      brands: await db.q<{ id: string; name: string }>("select id, name from brands where company_id=$1 and status='active' order by name", [ctx.companyId]),
      regions: await db.q<{ id: string; name: string }>("select id, name from regions where company_id=$1 and status='active' order by name", [ctx.companyId]),
      entities: await db.q<{ id: string; name: string }>("select id, name from legal_entities where company_id=$1 and status='active' order by name", [ctx.companyId]),
      tasks: Number((await db.one<{ n: string }>("select count(*) n from tasks where branch_id=$1 and status in ('open','in_progress','blocked')", [id]))!.n),
    };
  });
  if (!d) notFound();
  const { b } = d; const canEdit = ctx.has("edit", "branches") && b.status !== "closed";
  const pick = (r: { id: string; name: string }[]) => r.map((x) => ({ value: x.id, label: x.name }));
  const moves = nextBranchStates(b.status).filter((s) => s !== "closed");
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/branches" className="text-brand">Branches</Link> / {b.name}</nav>
      <PageHeader title={b.name} description={`${b.code} · ${b.ownership === "franchise" ? `Franchise${b.partner ? `: ${b.partner}` : ""}` : "Company-owned"} · ${b.timezone}`}
        actions={<>{b.status !== "closed" && ctx.has("archive", "branches") && <ButtonLink href={`/branches/${b.id}/close`} variant="danger">{b.status === "closing" ? "Continue closure" : "Review and close"}</ButtonLink>}</>} />
      <Flash ok={ok} err={err} />
      <div className="mb-3 flex flex-wrap items-center gap-2"><Status tone={TONE[b.status]}>{BRANCH_LABEL[b.status]}</Status><span className="text-sm text-muted">{d.tasks} open task{d.tasks === 1 ? "" : "s"}</span>
        {canEdit && moves.map((to) => (
          <form key={to} action={moveBranch}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="to" value={to} /><SubmitButton variant="secondary" pending="…">{{ opening: "Mark opening", active: b.status === "closing" ? "Cancel closure" : b.status === "suspended" ? "Reactivate" : "Mark active", suspended: "Suspend", closing: "Start closure", planned: "Mark planned", closed: "Close" }[to]}</SubmitButton></form>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {canEdit ? (
          <FormCard title="Details">
            <form action={updateBranch} className="space-y-2">
              <input type="hidden" name="id" value={b.id} />
              <Field label="Branch name" name="name" defaultValue={b.name} required />
              <div className="grid gap-2 sm:grid-cols-2">
                <Select label="Brand" name="brand_id" options={pick(d.brands)} placeholder="None" defaultValue={b.brand_id ?? ""} />
                <Select label="Region" name="region_id" options={pick(d.regions)} placeholder="None" defaultValue={b.region_id ?? ""} hint="Changing it keeps the branch's history." />
                <Select label="Legal entity" name="legal_entity_id" options={pick(d.entities)} placeholder="None" defaultValue={b.legal_entity_id ?? ""} />
                <Field label="Time zone" name="timezone" defaultValue={b.timezone} />
              </div>
              <Field label="Address" name="address" defaultValue={b.address.line1 ?? ""} /><Field label="Phone" name="phone" type="tel" defaultValue={b.address.phone ?? ""} />
              <SubmitButton>Save changes</SubmitButton>
            </form>
          </FormCard>
        ) : <Panel title="Details"><p className="text-sm">{b.address.line1 || "No address"}<br />{b.address.phone}</p></Panel>}
        <Panel title="History">
          <TableWrap label="Branch history"><thead><tr><Th>When</Th><Th>Status</Th><Th>Region</Th><Th>Brand</Th></tr></thead>
            <tbody>{d.history.map((h, i) => <tr key={i}><Td>{fmtDateTime(h.valid_from, ctx.company.timezone)}</Td><Td>{BRANCH_LABEL[h.status as BranchStatus] ?? h.status}</Td><Td>{h.region ?? "—"}</Td><Td>{h.brand ?? "—"}</Td></tr>)}</tbody></TableWrap>
          <p className="mt-1 text-xs text-muted">Reports use the placement that applied at the time, so moving a branch doesn't rewrite the past.</p>
        </Panel>
      </div>
    </>
  );
}
