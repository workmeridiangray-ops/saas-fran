import Link from "next/link";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createApplicant } from "../actions";
import { Field, FormCard, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add applicant" };

export default async function NewApplicant({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "franchise", { action: "create", module: "franchise", what: "adding applicants" }); if (denied) return denied;
  const { err } = await searchParams;
  return (<><PageHeader title="Add applicant" /><Flash err={err} />
    <FormCard><form action={createApplicant} className="space-y-2"><Field label="Name or company" name="name" required /><div className="grid gap-2 sm:grid-cols-2"><Field label="Email" name="email" type="email" /><Field label="Phone" name="phone" type="tel" /></div><Field label="How they found you" name="source" placeholder="Referral, event, website…" /><TextArea label="Notes" name="notes" />
      <div className="flex gap-1"><SubmitButton pending="Adding…">Add to pipeline</SubmitButton><Link href="/franchise" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div></form></FormCard></>);
}
