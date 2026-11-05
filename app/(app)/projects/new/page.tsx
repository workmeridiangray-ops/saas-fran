import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createProject } from "../actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";
import { OPENING_TEMPLATES } from "@/lib/templates/opening";

export const metadata = { title: "New opening project" };

export default async function NewProject({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "projects", { action: "create", module: "projects", what: "creating projects" }); if (denied) return denied;
  const { err } = await searchParams;
  const branches = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string }>("select id, name from branches where company_id = $1 and status in ('planned','opening') order by name", [ctx.companyId]));
  return (
    <>
      <PageHeader title="New opening project" description="Choose a template for your kind of business. You can add, remove and reassign items afterwards." /><Flash err={err} />
      <FormCard><form action={createProject} className="space-y-2">
        <Field label="Project name" name="name" required placeholder="Open Riverside" />
        <Select label="Template" name="industry" defaultValue={OPENING_TEMPLATES[ctx.company.industry] ? ctx.company.industry : "general"} options={Object.entries(OPENING_TEMPLATES).map(([k, t]) => ({ value: k, label: `${t.name} (${t.items.length} items)` }))} />
        <Select label="Branch being opened" name="branch_id" placeholder="Not created yet" options={branches.map((b) => ({ value: b.id, label: b.name }))} hint="Only branches marked Planned or Opening. Launching the project makes the branch active." />
        <div className="grid gap-2 sm:grid-cols-2"><Field label="Target launch" name="target" type="date" /><Field label={`Budget (${ctx.company.currency})`} name="budget" inputMode="decimal" /></div>
        <div className="flex gap-1"><SubmitButton pending="Creating…">Create project</SubmitButton><Link href="/projects" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div></form></FormCard>
    </>
  );
}
