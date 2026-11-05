import Link from "next/link";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createDocument } from "../actions";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New document" };

export default async function NewDoc({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "documents", { action: "create", module: "documents", what: "writing documents" }); if (denied) return denied;
  const { err } = await searchParams;
  return (
    <>
      <PageHeader title="New document" description="It starts as a draft. Nothing reaches staff until you publish it." /><Flash err={err} />
      <FormCard className="max-w-prose"><form action={createDocument} className="space-y-2">
        <Field label="Title" name="title" required /><Select label="Type" name="kind" options={[{ value: "sop", label: "Standard operating procedure" }, { value: "policy", label: "Policy" }, { value: "template", label: "Template" }]} />
        <TextArea label="Content" name="body" rows={12} hint="Plain text. Blank lines separate paragraphs." /><Field label="Review by (optional)" name="expires_on" type="date" hint="You'll see it flagged when it's due for review." />
        <div className="flex gap-1"><SubmitButton pending="Saving…">Save draft</SubmitButton><Link href="/knowledge" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div></form></FormCard>
    </>
  );
}
