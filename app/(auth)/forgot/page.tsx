import Link from "next/link";
import { requestReset } from "../actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Reset password" };

export default async function Forgot({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { err, ok } = await searchParams;
  return (
    <FormCard title="Reset your password">
      <Flash err={err} ok={ok} />
      <form action={requestReset} className="space-y-2">
        <Field label="Email" name="email" type="email" autoComplete="username" required />
        <SubmitButton className="w-full" pending="Sending…">Send reset link</SubmitButton>
      </form>
      <Link className="text-sm font-medium text-brand" href="/signin">Back to sign in</Link>
    </FormCard>
  );
}
