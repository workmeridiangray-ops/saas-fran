import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createTicket } from "../actions";
import { branchOptions, memberOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";
import { loadFields } from "@/lib/studio";
import { CustomFields } from "@/components/studio/CustomFields";

export const metadata = { title: "Raise a ticket" };

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tickets", { action: "create", module: "tickets", what: "raising tickets" }); if (denied) return denied;
  const { err } = await searchParams;
  const o = await asUser(ctx.user.id, async (db) => ({ branches: await branchOptions(db, ctx.companyId), people: await memberOptions(db, ctx.companyId), defs: await loadFields(db, ctx.companyId, "tickets") }));
  return (
    <>
      <PageHeader title="Raise a ticket" /><Flash err={err} />
      <FormCard><form action={createTicket} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2"><Select label="Type" name="kind" options={[{ value: "internal", label: "Internal request" }, { value: "customer_complaint", label: "Customer complaint" }, { value: "incident", label: "Incident / safety" }]} />
          <Select label="Priority" name="priority" defaultValue="normal" options={["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} /></div>
        <Field label="Title" name="title" required /><TextArea label="What happened?" name="body" rows={4} />
        <div className="grid gap-2 sm:grid-cols-2"><Select label="Branch" name="branch_id" placeholder="Company-wide" options={o.branches.map((b) => ({ value: b.id, label: b.name }))} /><Select label="Assign to" name="assignee_id" placeholder="Unassigned" options={o.people.map((p) => ({ value: p.user_id, label: p.name }))} /></div>
        <Field label="Category" name="category" placeholder="Equipment, purchasing, refund…" />
        <CustomFields defs={o.defs} />
        <div className="flex gap-1"><SubmitButton pending="Raising…">Raise ticket</SubmitButton><Link href="/tickets" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div>
      </form></FormCard>
    </>
  );
}
