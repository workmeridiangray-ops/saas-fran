import Link from "next/link";
import { asService } from "@/lib/db";
import { requireStaff } from "@/lib/platform";
import { markInvoicePaid, voidInvoice } from "../actions";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, StateMessage, Status, TableWrap, Td, Th } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Invoices" };

export default async function Invoices({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const staff = await requireStaff(); const { status = "open", ok, err } = await searchParams;
  const rows = await asService((db) => db.q<{ id: string; number: string; company: string; company_id: string; status: string; amount_minor: string; currency: string; due_at: string; paid_at: string | null }>(
    "select i.id, i.number, c.name company, c.id company_id, i.status, i.amount_minor, i.currency, i.due_at, i.paid_at from platform_invoices i join companies c on c.id = i.company_id where ($1 = '' or i.status = $1) order by i.due_at desc limit 300", [status]));
  const canAct = staff.role === "super_admin" || staff.role === "billing";
  return (
    <>
      <PageHeader title="Invoices" description="Subscription invoices from companies to the platform. Royalties between franchise partners and brands are not shown here." /><Flash ok={ok} err={err} />
      <div className="mb-2 flex gap-1">{["open", "paid", "void", ""].map((s) => <Link key={s} href={`/platform/invoices?status=${s}`} aria-current={status === s ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${status === s ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{s ? s[0]!.toUpperCase() + s.slice(1) : "All"}</Link>)}</div>
      {rows.length === 0 ? <StateMessage title="No invoices here">Invoices are issued automatically when trials end and subscriptions renew.</StateMessage> : (
        <TableWrap label="Invoices"><thead><tr><Th>Invoice</Th><Th>Company</Th><Th>Due</Th><Th num>Amount</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>{rows.map((i) => { const late = i.status === "open" && new Date(i.due_at) < new Date(); return <tr key={i.id}><Td className="font-medium">{i.number}</Td><Td><Link className="text-brand" href={`/platform/companies/${i.company_id}`}>{i.company}</Link></Td><Td>{fmtDate(i.due_at)}{late && <> <Status tone="danger">Overdue</Status></>}</Td><Td num>{formatMinor(Number(i.amount_minor), i.currency)}</Td><Td><Status tone={i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "neutral"}>{i.status[0]!.toUpperCase() + i.status.slice(1)}</Status></Td>
            <Td>{i.status === "open" && canAct && <span className="flex gap-1"><form action={markInvoicePaid}><input type="hidden" name="id" value={i.id} /><SubmitButton variant="secondary" pending="…">Mark paid</SubmitButton></form><form action={voidInvoice}><input type="hidden" name="id" value={i.id} /><SubmitButton variant="danger" pending="…">Void</SubmitButton></form></span>}</Td></tr>; })}</tbody></TableWrap>)}
    </>
  );
}
