import Link from "next/link";
import { resetPassword } from "../actions";
import { peekToken } from "@/lib/auth/tokens";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Choose a new password" };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; err?: string }> }) {
  const { token = "", err } = await searchParams;
  const valid = token && (await peekToken("reset_password", token));
  if (!valid) return (
    <FormCard title="This link isn't valid">
      <p className="text-sm text-muted">It may have expired or already been used. Reset links work once, for one hour.</p>
      <Link className="text-sm font-medium text-brand" href="/forgot">Request a new link</Link>
    </FormCard>
  );
  return (
    <FormCard title="Choose a new password">
      <Flash err={err} />
      <form action={resetPassword} className="space-y-2">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters. You'll be signed out everywhere else." />
        <SubmitButton className="w-full">Change password</SubmitButton>
      </form>
    </FormCard>
  );
}
