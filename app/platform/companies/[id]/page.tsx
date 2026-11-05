import Link from "next/link";
import { notFound } from "next/navigation";
import { asService } from "@/lib/db";
import { requireStaff } from "@/lib/platform";
import { markInvoicePaid, setCompanyStatus } from "../../actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status, TableWrap, Td, Th } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

export default async function CompanyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const staff = await requireStaff(); const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asService(async (db) => {
    const c = await db.one<{ name: string; status: string; industry: string; operating_model: string; currency: string; created_at: string; plan_id: string | null; sub_status: string | null; period_end: string | null; branches: string; users: string; storage: string }>(
      `select c.name, c.status, c.industry, c.operating_model, c.currency, c.created_at, s.plan_id, s.status sub_status, s.current_period_end period_end,
              (select count(*) from branches b where b.company_id = c.id and b.status <> 'closed') branches, (select count(*) from memberships m where m.company_id = c.id and m.status = 'active') users,
              (select coalesce(sum(size_bytes),0) from attachments a where a.company_id = c.id) storage from companies c left join subscriptions s on s.company_id = c.id where c.id = $1`, [id]);
    return c ? { c, invoices: await db.q<{ id: string; number: string; status: string; amount_minor: string; currency: string; due_at: string }>("select id, number, status, amount_minor, currency, due_at from platform_invoices where company_id = $1 order by period_start desc", [id]),
      owners: await db.q<{ email: string }>("select p.email from memberships m join profiles p on p.id = m.user_id join membership_roles mr on mr.membership_id = m.id join roles r on r.id = mr.role_id where m.company_id = $1 and r.name = 'Company owner'", [id]) } : null;
  });
  if (!d) notFound(); const { c } = d; const canAct = staff.role === "super_admin" || staff.role === "billing";
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/platform/companies" className="text-brand">Companies</Link> / {c.name}</nav>
      <PageHeader title={c.name} description={`${titleCase(c.industry)} · ${titleCase(c.operating_model)} · created ${fmtDate(c.created_at)} · owners: ${d.owners.map((o) => o.email).join(", ") || "—"}`} actions={<Status tone={c.status === "active" ? "ok" : c.status === "suspended" ? "danger" : "info"}>{titleCase(c.status)}</Status>} />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Subscription"><p className="text-sm">{c.plan_id ? `${titleCase(c.plan_id)} · ${titleCase(c.sub_status ?? "")} · period ends ${fmtDate(c.period_end)}` : "No subscription"}</p>
          <dl className="mt-1 grid grid-cols-3 text-sm"><div><dt className="text-xs text-muted">Branches</dt><dd>{c.branches}</dd></div><div><dt className="text-xs text-muted">Users</dt><dd>{c.users}</dd></div><div><dt className="text-xs text-muted">Storage</dt><dd>{(Number(c.storage) / 1_048_576).toFixed(1)} MB</dd></div></dl></Panel>
        {canAct && c.status !== "closed" && <FormCard title={c.status === "suspended" ? "Reactivate" : "Suspend"}><p className="text-sm text-muted">{c.status === "suspended" ? "Restores write access immediately." : "The company becomes read-only. Its data stays safe and exportable."} Recorded in the audit log under your name.</p>
          <form action={setCompanyStatus} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={c.status === "suspended" ? "active" : "suspended"} /><Field label="Reason" name="reason" required /><SubmitButton variant={c.status === "suspended" ? "primary" : "danger"} pending="Saving…">{c.status === "suspended" ? "Reactivate company" : "Suspend company"}</SubmitButton></form></FormCard>}
      </div>
      <h2 className="mb-1 mt-3 text-sm font-semibold text-muted">Invoices</h2>
      <TableWrap label="Invoices"><thead><tr><Th>Invoice</Th><Th>Due</Th><Th num>Amount</Th><Th>Status</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
        <tbody>{d.invoices.map((i) => <tr key={i.id}><Td className="font-medium">{i.number}</Td><Td>{fmtDate(i.due_at)}</Td><Td num>{formatMinor(Number(i.amount_minor), i.currency)}</Td><Td><Status tone={i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "neutral"}>{titleCase(i.status)}</Status></Td>
          <Td>{i.status === "open" && canAct && <form action={markInvoicePaid}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="back" value={`/platform/companies/${id}`} /><SubmitButton variant="secondary" pending="…">Mark paid</SubmitButton></form>}</Td></tr>)}</tbody></TableWrap>
    </>
  );
}
