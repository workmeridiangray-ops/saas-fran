import { asService } from "@/lib/db";
import { requireStaff } from "@/lib/platform";
import { newPlanVersion } from "../actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, TableWrap, Td, Th } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Plans" };

export default async function Plans({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const staff = await requireStaff(); const { ok, err } = await searchParams;
  const d = await asService(async (db) => ({
    versions: await db.q<{ plan_id: string; version: number; monthly_price_minor: string; currency: string; max_branches: number | null; max_users: number | null; storage_mb: number | null; modules: string[]; created_at: string; subs: string }>("select v.*, (select count(*) from subscriptions s where s.plan_id = v.plan_id and s.plan_version = v.version) subs from plan_versions v order by v.plan_id, v.version desc"),
    plans: await db.q<{ id: string; name: string }>("select id, name from plans order by 1"),
  }));
  const lim = (n: number | null) => (n === null ? "∞" : n.toLocaleString("en"));
  return (
    <>
      <PageHeader title="Plans" description="Versions are immutable. Editing a plan publishes a new version; existing subscribers keep theirs until they change plan or renew onto it by choice." /><Flash ok={ok} err={err} />
      <TableWrap label="Plan versions"><thead><tr><Th>Plan</Th><Th num>Version</Th><Th num>Price / month</Th><Th num>Branches</Th><Th num>Users</Th><Th num>Storage MB</Th><Th>Modules</Th><Th num>Subscribers</Th><Th>Published</Th></tr></thead>
        <tbody>{d.versions.map((v) => <tr key={v.plan_id + v.version}><Td className="font-medium">{v.plan_id}</Td><Td num>v{v.version}</Td><Td num>{formatMinor(Number(v.monthly_price_minor), v.currency)}</Td><Td num>{lim(v.max_branches)}</Td><Td num>{lim(v.max_users)}</Td><Td num>{lim(v.storage_mb)}</Td><Td className="text-xs text-muted">{v.modules.join(", ")}</Td><Td num>{v.subs}</Td><Td>{fmtDate(v.created_at)}</Td></tr>)}</tbody></TableWrap>
      {staff.role === "super_admin" && <div className="mt-3"><FormCard title="Publish a new version"><form action={newPlanVersion} className="space-y-2">
        <Select label="Plan" name="plan_id" options={d.plans.map((p) => ({ value: p.id, label: p.name }))} /><Field label="Price per month (USD)" name="price" inputMode="decimal" required />
        <div className="grid grid-cols-3 gap-2"><Field label="Max branches" name="max_branches" type="number" hint="Blank = unlimited" /><Field label="Max users" name="max_users" type="number" /><Field label="Storage MB" name="storage_mb" type="number" /></div>
        <Field label="Modules (comma separated)" name="modules" required defaultValue="tasks,documents,tickets,people" /><SubmitButton pending="Publishing…">Publish version</SubmitButton></form></FormCard></div>}
    </>
  );
}
