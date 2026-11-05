import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { inviteMember, revokeInvitation, updateMember } from "./actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status, TableWrap, Td, Th, ButtonLink } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "People & access" };

export default async function People({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "users", { module: "people", what: "People & access" }); if (denied) return denied;
  const { ok, err, edit } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => ({
    members: await db.q<{ id: string; user_id: string; name: string; email: string; status: string; branch_ids: string[]; brand_ids: string[]; region_ids: string[]; limit: string | null; role_id: string | null; role: string | null }>(
      `select m.id, m.user_id, coalesce(p.display_name,'') name, coalesce(p.email,'') email, m.status, m.branch_ids, m.brand_ids, m.region_ids, m.approval_limit_minor::text "limit", r.id role_id, r.name role
         from memberships m left join profiles p on p.id = m.user_id left join membership_roles mr on mr.membership_id = m.id left join roles r on r.id = mr.role_id
        where m.company_id = $1 order by m.status, p.display_name`, [ctx.companyId]),
    invites: await db.q<{ id: string; email: string; role: string; expires_at: string }>("select i.id, i.email, r.name role, i.expires_at from invitations i join roles r on r.id = i.role_id where i.company_id = $1 and i.status = 'pending' and i.expires_at > now() order by i.created_at desc", [ctx.companyId]),
    roles: await db.q<{ id: string; name: string }>("select id, name from roles where company_id = $1 order by name", [ctx.companyId]),
    branches: await db.q<{ id: string; name: string }>("select id, name from branches where company_id = $1 and status <> 'closed' order by name", [ctx.companyId]),
    brands: await db.q<{ id: string; name: string }>("select id, name from brands where company_id = $1 and status = 'active' order by name", [ctx.companyId]),
    regions: await db.q<{ id: string; name: string }>("select id, name from regions where company_id = $1 and status = 'active' order by name", [ctx.companyId]),
  }));
  const roleOpts = d.roles.map((r) => ({ value: r.id, label: r.name }));
  const canInvite = ctx.has("create", "users"), canEdit = ctx.has("edit", "users");
  const branchName = (id: string) => d.branches.find((b) => b.id === id)?.name ?? "branch";
  const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "—";
  const scopeText = (m: { branch_ids: string[]; brand_ids: string[]; region_ids: string[] }) => {
    const parts = [...m.region_ids.map((x) => `Region ${nameOf(d.regions, x)}`), ...m.brand_ids.map((x) => `Brand ${nameOf(d.brands, x)}`), ...m.branch_ids.map(branchName)];
    return parts.length ? parts.join(", ") : "Whole company";
  };
  const scopeFields = (cur?: { branch_ids: string[]; brand_ids: string[]; region_ids: string[] }) => (
    <div className="space-y-1.5">
      {([["Regions", "region_ids", d.regions, cur?.region_ids], ["Brands", "brand_ids", d.brands, cur?.brand_ids], ["Branches", "branch_ids", d.branches, cur?.branch_ids]] as const).map(([label, name, list, sel]) => list.length > 0 && (
        <fieldset key={name}><legend className="mb-0.5 text-sm font-medium">{label}</legend>
          <div className="grid gap-0.5 sm:grid-cols-2">{list.map((b) => <label key={b.id} className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name={name} value={b.id} defaultChecked={sel?.includes(b.id)} />{b.name}</label>)}</div></fieldset>))}
      <p className="text-xs text-muted">Tick nothing for the whole company. A region includes the regions beneath it. Ticking several narrows nothing further: a person must match every group you tick.</p>
    </div>);
  const editing = d.members.find((m) => m.id === edit);
  return (
    <>
      <PageHeader title="People & access" description="Roles decide what someone can do. Branch scope decides where."
        actions={<ButtonLink href="/people/roles">Manage roles</ButtonLink>} />
      <Flash ok={ok} err={err} />
      <TableWrap label="Members">
        <thead><tr><Th>Person</Th><Th>Role</Th><Th>Scope</Th><Th num>Approval limit</Th><Th>Status</Th><Th><span className="sr-only">Edit</span></Th></tr></thead>
        <tbody>{d.members.map((m) => (
          <tr key={m.id}><Td><span className="font-medium">{m.name || m.email}</span><span className="block text-xs text-muted">{m.email}</span></Td>
            <Td>{m.role ?? <span className="text-muted">No role</span>}</Td>
            <Td>{scopeText(m)}</Td>
            <Td num>{m.limit === null ? "—" : (Number(m.limit) / 100).toLocaleString("en", { style: "currency", currency: ctx.company.currency })}</Td>
            <Td><Status tone={m.status === "active" ? "ok" : m.status === "invited" ? "info" : "warn"}>{m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Suspended"}</Status></Td>
            <Td>{canEdit && <Link className="text-sm font-medium text-brand" href={`/people?edit=${m.id}`}>Edit access</Link>}</Td></tr>
        ))}</tbody>
      </TableWrap>

      {editing && canEdit && (
        <FormCard title={`Access for ${editing.name || editing.email}`} className="mt-3">
          <form action={updateMember} className="space-y-2">
            <input type="hidden" name="id" value={editing.id} />
            <Select label="Role" name="role_id" options={roleOpts} defaultValue={editing.role_id ?? ""} />
            {scopeFields(editing)}
            <Field label={`Approval limit (${ctx.company.currency})`} name="limit" type="number" step="0.01" min="0" defaultValue={editing.limit === null ? "" : String(Number(editing.limit) / 100)} hint="The largest single request they may approve. Blank means none." />
            <Select label="Status" name="status" defaultValue={editing.status} options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended (no access; history kept)" }]} />
            <div className="flex gap-1"><SubmitButton>Save access</SubmitButton><Link className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand" href="/people">Cancel</Link></div>
          </form>
        </FormCard>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {canInvite && (
          <FormCard title="Invite someone">
            <form action={inviteMember} className="space-y-2">
              <Field label="Email" name="email" type="email" required />
              <Select label="Role" name="role_id" options={roleOpts} />
              {scopeFields()}
              <SubmitButton pending="Sending…">Send invitation</SubmitButton>
            </form>
          </FormCard>
        )}
        <Panel title="Pending invitations">
          {d.invites.length === 0 ? <p className="text-sm text-muted">No pending invitations.</p> : (
            <ul className="divide-y divide-line">{d.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-1 py-1 text-sm"><span>{i.email}<span className="block text-xs text-muted">{i.role} · expires {fmtDate(i.expires_at)}</span></span>
                {canInvite && <form action={revokeInvitation}><input type="hidden" name="id" value={i.id} /><SubmitButton variant="secondary" pending="…">Withdraw</SubmitButton></form>}</li>))}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
