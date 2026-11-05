import { signOut, verifySecondFactor } from "../actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Two-factor code" };

export default async function TwoFactor({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const { next = "/", err } = await searchParams;
  return (
    <FormCard title="Enter your verification code">
      <Flash err={err} />
      <form action={verifySecondFactor} className="space-y-2">
        <input type="hidden" name="next" value={next} />
        <Field label="6-digit code, or a recovery code" name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus />
        <SubmitButton className="w-full" pending="Checking…">Continue</SubmitButton>
      </form>
      <form action={signOut}><button className="text-sm font-medium text-brand">Use a different account</button></form>
    </FormCard>
  );
}
