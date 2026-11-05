import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createTask } from "../actions";
import { branchOptions, memberOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New task" };

export default async function NewTask({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tasks", { action: "create", module: "tasks", what: "creating tasks" }); if (denied) return denied;
  const { err } = await searchParams;
  const o = await asUser(ctx.user.id, async (db) => ({ branches: await branchOptions(db, ctx.companyId), people: await memberOptions(db, ctx.companyId) }));
  return (
    <>
      <PageHeader title="New task" />
      <Flash err={err} />
      <FormCard>
        <form action={createTask} className="space-y-2">
          <Field label="Title" name="title" required />
          <TextArea label="Details" name="description" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select label="Branch" name="branch_id" placeholder="Company-wide" options={o.branches.map((b) => ({ value: b.id, label: b.name }))} />
            <Select label="Assign to" name="assignee_id" placeholder="Unassigned" options={o.people.map((p) => ({ value: p.user_id, label: p.name }))} />
            <Field label="Due" name="due" type="datetime-local" hint="In the branch's time zone." />
            <Select label="Priority" name="priority" defaultValue="normal" options={["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} />
          </div>
          <label className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name="requires_evidence" /> Require proof of completion</label>
          <div className="flex gap-1"><SubmitButton pending="Creating…">Create task</SubmitButton><Link href="/tasks" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div>
        </form>
      </FormCard>
    </>
  );
}
