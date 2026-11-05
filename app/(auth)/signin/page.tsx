import Link from "next/link";
import { signIn } from "../actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { getT } from "@/lib/i18n";

export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; err?: string; ok?: string; expired?: string; out?: string }> }) {
  const { next = "/", err, ok, expired, out } = await searchParams; const { t } = await getT();
  return (
    <FormCard title={t("Sign in")}>
      <Flash err={err} ok={ok ?? (out ? t("You're signed out.") : undefined)} />
      {expired && !err && <p role="status" className="rounded-md bg-info-bg p-1.5 text-sm text-info">{t("Your session ended. Sign in to continue; nothing you had open was lost.")}</p>}
      <form action={signIn} className="space-y-2">
        <input type="hidden" name="next" value={next} />
        <Field label={t("Email")} name="email" type="email" autoComplete="username" required />
        <Field label={t("Password")} name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className="w-full" pending={t("Signing in…")}>{t("Sign in")}</SubmitButton>
      </form>
      <div className="flex justify-between text-sm">
        <Link className="font-medium text-brand" href="/forgot">{t("Forgot password?")}</Link>
        <Link className="font-medium text-brand" href={`/signup?next=${encodeURIComponent(next)}`}>{t("Create account")}</Link>
      </div>
    </FormCard>
  );
}
