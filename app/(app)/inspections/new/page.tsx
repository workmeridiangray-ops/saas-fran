import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { scheduleInspection } from "../actions";
import { branchOptions, memberOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Schedule inspection" };

export default async function NewInspection({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "inspections", { action: "create", module: "inspections", what: "scheduling inspections" }); if (denied) return denied;
  const { err } = await searchParams;
  const o = await asUser(ctx.user.id, async (db) => ({ branches: await branchOptions(db, ctx.companyId), people: await memberOptions(db, ctx.companyId), templates: await db.q<{ id: string; name: string }>("select id, name from inspection_templates where company_id = $1 and status = 'active' order by name", [ctx.companyId]) }));
  return (
    <>
      <PageHeader title="Schedule inspection" /><Flash err={err} />
      <FormCard><form action={scheduleInspection} className="space-y-2">
        <Select label="Branch" name="branch_id" options={o.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <Select label="Template" name="template_id" options={o.templates.map((t) => ({ value: t.id, label: t.name }))} />
        <Select label="Inspector" name="inspector_id" defaultValue={ctx.user.id} options={o.people.map((p) => ({ value: p.user_id, label: p.name }))} />
        <Field label="Date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        <div className="flex gap-1"><SubmitButton pending="Scheduling…">Schedule</SubmitButton><Link href="/inspections" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div>
      </form></FormCard>
    </>
  );
}
