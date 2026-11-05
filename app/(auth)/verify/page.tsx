import Link from "next/link";
import { confirmEmail, resendVerification } from "../actions";
import { peekToken } from "@/lib/auth/tokens";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Confirm your email" };

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; sent?: string; next?: string; err?: string; ok?: string }> }) {
  const { token, sent, next = "/", err, ok } = await searchParams;
  if (token && (await peekToken("verify_email", token))) return (
    <FormCard title="Confirm your email">
      <Flash err={err} />
      <p className="text-sm text-muted">One more click to finish creating your account.</p>
      <form action={confirmEmail}><input type="hidden" name="token" value={token} /><input type="hidden" name="next" value={next} /><SubmitButton className="w-full">Confirm my email</SubmitButton></form>
    </FormCard>
  );
  return (
    <FormCard title={sent || ok ? "Check your email" : "Confirm your email"}>
      <Flash err={err ?? (token ? "That link has expired or was already used. Request a new one below." : undefined)} ok={ok} />
      <p className="text-sm text-muted">{sent ? "We've sent a confirmation link. It works for 2 days." : "Enter your address and we'll send a new confirmation link."}</p>
      <form action={resendVerification} className="space-y-2">
        <Field label="Email" name="email" type="email" required />
        <SubmitButton variant="secondary" className="w-full" pending="Sending…">Send a new link</SubmitButton>
      </form>
      <Link className="text-sm font-medium text-brand" href={`/signin?next=${encodeURIComponent(next)}`}>Back to sign in</Link>
    </FormCard>
  );
}
