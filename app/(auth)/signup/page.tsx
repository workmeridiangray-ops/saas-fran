import Link from "next/link";
import { signUp } from "../actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Create account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const { next = "/", err } = await searchParams;
  return (
    <FormCard title="Create your account">
      <Flash err={err} />
      <form action={signUp} className="space-y-2">
        <input type="hidden" name="next" value={next} />
        <Field label="Your name" name="name" autoComplete="name" required />
        <Field label="Work email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters. A passphrase works well." />
        <SubmitButton className="w-full" pending="Creating account…">Create account</SubmitButton>
      </form>
      <p className="text-sm text-muted">Already have an account? <Link className="font-medium text-brand" href={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
    </FormCard>
  );
}
