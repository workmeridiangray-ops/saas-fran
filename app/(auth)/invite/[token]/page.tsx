import Link from "next/link";
import { acceptInvitation } from "../../actions";
import { peekToken } from "@/lib/auth/tokens";
import { currentSession } from "@/lib/auth/session";
import { asService } from "@/lib/db";
import { FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Join workspace" };

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params; const { err } = await searchParams;
  const t = await peekToken("invitation", token);
  const info = t && await asService((db) => db.one<{ name: string; email: string; status: string }>(
    "select c.name, i.email, i.status from invitations i join companies c on c.id = i.company_id where i.id = $1 and i.expires_at > now()", [(t.payload as { invitation_id: string }).invitation_id]));
  if (!t || !info || info.status !== "pending") return (
    <FormCard title="This invitation isn't valid">
      <p className="text-sm text-muted">It may have expired, been withdrawn, or already been used. Ask the person who invited you to send a new one.</p>
      <Link className="text-sm font-medium text-brand" href="/signin">Go to sign in</Link>
    </FormCard>
  );
  const me = await currentSession();
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <FormCard title={`Join ${info.name}`}>
      <Flash err={err} />
      <p className="text-sm text-muted">This invitation is for <strong>{info.email}</strong>.</p>
      {me ? (
        <form action={acceptInvitation}><input type="hidden" name="token" value={token} /><SubmitButton className="w-full">Accept and open workspace</SubmitButton></form>
      ) : (
        <div className="flex flex-col gap-1">
          <Link className="inline-flex min-h-touch items-center justify-center rounded-md bg-brand px-3 text-sm font-medium text-white" href={`/signup?next=${next}`}>Create account</Link>
          <Link className="inline-flex min-h-touch items-center justify-center rounded-md border border-line-strong px-3 text-sm font-medium" href={`/signin?next=${next}`}>I already have an account</Link>
        </div>
      )}
    </FormCard>
  );
}
