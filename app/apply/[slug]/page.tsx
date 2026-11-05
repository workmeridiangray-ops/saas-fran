import { asService } from "@/lib/db";
import { submitEnquiry } from "./actions";
import { Field, FormCard, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Franchise enquiry" };

export default async function Apply({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sent?: string; err?: string }> }) {
  const { slug } = await params; const { sent, err } = await searchParams;
  const c = await asService((db) => db.one<{ name: string; open: boolean }>("select c.name, (c.status in ('trial','active','past_due') and 'franchise' = any (coalesce((select modules from app.current_plan(c.id)), '{}'))) open from companies c where c.slug = $1", [slug]));
  if (!c || !c.open) return <main className="mx-auto max-w-form p-3 pt-8"><h1 className="text-xl font-semibold">This page isn't available</h1><p className="mt-1 text-sm text-muted">Check the address you were given, or contact the company directly.</p></main>;
  return (
    <main className="mx-auto max-w-form space-y-2 p-3 pt-8">
      <h1 className="text-2xl font-semibold">Franchise with {c.name}</h1>
      <p className="text-sm text-muted">Tell us a little about yourself and where you'd like to operate. A member of the team will reply by email.</p>
      {sent ? <div role="status" className="rounded-lg border border-line bg-surface p-3"><p className="font-semibold">Thank you. Your enquiry has been received.</p><p className="text-sm text-muted">We'll be in touch at the email address you gave.</p></div> : (<>
        <Flash err={err} />
        <FormCard><form action={submitEnquiry} className="space-y-2"><input type="hidden" name="slug" value={slug} />
          <div aria-hidden className="absolute -left-[9999px]"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <Field label="Your name" name="name" required autoComplete="name" /><Field label="Email" name="email" type="email" required autoComplete="email" /><Field label="Phone" name="phone" type="tel" autoComplete="tel" />
          <TextArea label="Where would you like to open, and what's your background?" name="message" rows={4} /><SubmitButton className="w-full" pending="Sending…">Send enquiry</SubmitButton>
          <p className="text-xs text-muted">We use your details only to respond to this enquiry.</p></form></FormCard></>)}
    </main>
  );
}
