import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addAsset, addLicence, renewLicence, setAssetStatus } from "./actions";
import { branchOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Assets & licences" };
const dayDiff = (d: string) => Math.ceil((new Date(d).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);

export default async function Assets({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "assets", { module: "assets", what: "assets" }); if (denied) return denied;
  const { tab = "assets", ok, err } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => ({
    branches: await branchOptions(db, ctx.companyId),
    assets: await db.q<{ id: string; name: string; serial: string | null; status: string; warranty_until: string | null; cost_minor: string | null; branch: string }>("select a.id, a.name, a.serial, a.status, a.warranty_until, a.cost_minor, b.name branch from assets a join branches b on b.id = a.branch_id where a.company_id = $1 order by (a.status = 'disposed'), a.name", [ctx.companyId]),
    licences: await db.q<{ id: string; name: string; expires_on: string; branch: string | null }>("select l.id, l.name, l.expires_on, b.name branch from licences l left join branches b on b.id = l.branch_id where l.company_id = $1 order by l.expires_on", [ctx.companyId]),
  }));
  const canAdd = ctx.has("create", "assets"); const tabLink = (k: string, l: string) => <Link key={k} href={`/assets?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  const branchOpts = d.branches.map((b) => ({ value: b.id, label: b.name }));
  return (
    <>
      <PageHeader title="Assets & licences" description="Equipment per branch, and the licences and permits that must be renewed." /><Flash ok={ok} err={err} />
      <div className="mb-2 flex gap-1">{tabLink("assets", "Assets")}{tabLink("licences", "Licences & permits")}</div>
      {tab === "assets" ? (<div className="space-y-3">
        {d.assets.length === 0 ? <StateMessage title="No assets yet">Record equipment with its serial number, location and warranty.</StateMessage> : (
          <TableWrap label="Assets"><thead><tr><Th>Asset</Th><Th>Branch</Th><Th>Serial</Th><Th>Warranty</Th><Th num>Cost</Th><Th>Status</Th><Th><span className="sr-only">Change</span></Th></tr></thead>
            <tbody>{d.assets.map((a) => { const w = a.warranty_until ? dayDiff(a.warranty_until) : null; return <tr key={a.id}><Td className="font-medium">{a.name}</Td><Td>{a.branch}</Td><Td>{a.serial ?? "—"}</Td><Td>{a.warranty_until ? fmtDate(a.warranty_until) : "—"}{w !== null && w < 0 && <> <Status tone="neutral">Expired</Status></>}{w !== null && w >= 0 && w <= 30 && <> <Status tone="warn">{w}d left</Status></>}</Td><Td num>{a.cost_minor ? formatMinor(Number(a.cost_minor), ctx.company.currency) : "—"}</Td><Td><Status tone={a.status === "active" ? "ok" : a.status === "under_repair" ? "warn" : "neutral"}>{titleCase(a.status)}</Status></Td>
              <Td>{a.status !== "disposed" && ctx.has("edit", "assets") && <form action={setAssetStatus} className="flex gap-0.5"><input type="hidden" name="id" value={a.id} /><select name="to" defaultValue={a.status} aria-label={`Status for ${a.name}`} className="min-h-touch rounded-md border border-line-strong bg-surface px-1 text-xs"><option value="active">Active</option><option value="under_repair">Under repair</option><option value="disposed">Disposed</option></select><SubmitButton variant="secondary" pending="…">Set</SubmitButton></form>}</Td></tr>; })}</tbody></TableWrap>)}
        {canAdd && d.branches.length > 0 && <FormCard title="Add an asset"><form action={addAsset} className="space-y-2"><Select label="Branch" name="branch_id" options={branchOpts} /><Field label="Name" name="name" required /><div className="grid grid-cols-2 gap-2"><Field label="Serial number" name="serial" /><Field label={`Cost (${ctx.company.currency})`} name="cost" inputMode="decimal" /></div><Field label="Warranty until" name="warranty" type="date" /><Field label="Notes" name="notes" /><SubmitButton pending="Adding…">Add asset</SubmitButton></form></FormCard>}
      </div>) : (<div className="space-y-3">
        {d.licences.length === 0 ? <StateMessage title="No licences yet">Track permits and licences so renewals are never missed. They appear on the command centre 30 days before they expire.</StateMessage> : (
          <TableWrap label="Licences"><thead><tr><Th>Licence</Th><Th>Branch</Th><Th>Expires</Th><Th>Status</Th><Th><span className="sr-only">Renew</span></Th></tr></thead>
            <tbody>{d.licences.map((l) => { const n = dayDiff(l.expires_on); const tone: Tone = n < 0 ? "danger" : n <= 30 ? "warn" : "ok"; return <tr key={l.id}><Td className="font-medium">{l.name}</Td><Td>{l.branch ?? "Company-wide"}</Td><Td>{fmtDate(l.expires_on)}</Td><Td><Status tone={tone}>{n < 0 ? `Expired ${-n}d ago` : n <= 30 ? `Expires in ${n}d` : "Valid"}</Status></Td>
              <Td>{ctx.has("edit", "assets") && <form action={renewLicence} className="flex gap-0.5"><input type="hidden" name="id" value={l.id} /><input type="date" name="expires_on" required aria-label={`New expiry for ${l.name}`} className="min-h-touch rounded-md border border-line-strong bg-surface px-1 text-xs" /><SubmitButton variant="secondary" pending="…">Renew</SubmitButton></form>}</Td></tr>; })}</tbody></TableWrap>)}
        {canAdd && <FormCard title="Add a licence or permit"><form action={addLicence} className="space-y-2"><Field label="Name" name="name" required /><Select label="Branch" name="branch_id" placeholder="Company-wide" options={branchOpts} /><Field label="Expires on" name="expires_on" type="date" required /><Field label="Notes" name="notes" /><SubmitButton pending="Adding…">Add licence</SubmitButton></form></FormCard>}
      </div>)}
    </>
  );
}
