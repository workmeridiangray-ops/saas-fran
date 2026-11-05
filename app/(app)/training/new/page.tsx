import Link from "next/link";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createCourse } from "../actions";
import { Field, FormCard, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New course" };

export default async function NewCourse({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "training", { action: "create", module: "training", what: "creating courses" }); if (denied) return denied;
  const { err } = await searchParams;
  return (
    <>
      <PageHeader title="New course" /><Flash err={err} />
      <FormCard className="max-w-prose"><form action={createCourse} className="space-y-2">
        <Field label="Title" name="title" required /><Field label="Short description" name="description" /><TextArea label="Lesson" name="lesson" rows={8} />
        <TextArea label="Quiz" name="quiz" rows={9} hint="One question per block, blank line between blocks. Mark the correct option with *." placeholder={"What is the safe fridge temperature?\n* Below 5°C\nBelow 15°C\nRoom temperature\n\nHow often are logs checked?\nWeekly\n* Every shift"} />
        <div className="grid grid-cols-3 gap-2"><Field label="Pass mark %" name="pass_mark" type="number" defaultValue="80" min={1} max={100} /><Field label="Max attempts" name="max_attempts" type="number" defaultValue="3" min={1} /><Field label="Valid for (days)" name="validity_days" type="number" min={1} hint="Blank = never expires" /></div>
        <div className="flex gap-1"><SubmitButton pending="Creating…">Create course</SubmitButton><Link href="/training" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div></form></FormCard>
    </>
  );
}
