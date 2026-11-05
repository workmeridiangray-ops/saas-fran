import Link from "next/link";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth/session";
import { asService } from "@/lib/db";
import { otpauthUri } from "@/lib/auth/totp";
import { beginTotp, changePassword, disableTotp, revokeOthers, revokeSession, updateProfile } from "./actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Status } from "@/components/ui";
import { TotpConfirm } from "@/components/account/TotpConfirm";

export const metadata = { title: "Your account" };

export default async function Account({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const u = await requireUser(); const { ok, err } = await searchParams;
  const { secret, sessions } = await asService(async (db) => ({
    secret: (await db.one<{ totp_secret: string | null }>("select totp_secret from identity.users where id = $1", [u.id]))?.totp_secret ?? null,
    sessions: await db.q<{ id: string; user_agent: string | null; ip: string | null; created_at: string; last_seen_at: string }>("select id, user_agent, ip, created_at, last_seen_at from identity.sessions where user_id = $1 and expires_at > now() and not pending_2fa order by last_seen_at desc", [u.id]),
  }));
  const qr = secret && !u.totpEnabled ? await QRCode.toDataURL(otpauthUri(secret, u.email), { margin: 1, width: 192 }) : null;
  return (
    <main className="mx-auto max-w-[56rem] space-y-3 p-3">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Your account</h1><Link className="text-sm font-medium text-brand" href="/">Back to app</Link></div>
      <Flash ok={ok} err={err} />
      <FormCard title="Profile">
        <p className="text-sm text-muted">Signed in as {u.email}</p>
        <form action={updateProfile} className="space-y-2"><Field label="Your name" name="name" defaultValue={u.displayName} required /><SubmitButton>Save</SubmitButton></form>
      </FormCard>
      <FormCard title="Password">
        <form action={changePassword} className="space-y-2">
          <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
          <Field label="New password" name="next" type="password" autoComplete="new-password" required minLength={10} hint="Other devices are signed out when you change it." />
          <SubmitButton>Change password</SubmitButton>
        </form>
      </FormCard>
      <FormCard title="Two-factor authentication">
        {u.totpEnabled ? (
          <>
            <p className="text-sm"><Status tone="ok">On</Status> You'll be asked for a code from your authenticator app when you sign in.</p>
            <form action={disableTotp} className="space-y-2"><Field label="Confirm with your password to turn it off" name="password" type="password" required /><SubmitButton variant="danger">Turn off two-factor</SubmitButton></form>
          </>
        ) : qr ? (
          <>
            <p className="text-sm">Scan this with an authenticator app (1Password, Authy, Google Authenticator), then enter the code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code to add this account to your authenticator app" width={192} height={192} className="rounded-md border border-line" />
            <p className="text-xs text-muted">Can't scan? Enter this key by hand: <code className="font-mono">{secret}</code></p>
            <TotpConfirm />
          </>
        ) : (
          <form action={beginTotp}><p className="mb-1 text-sm text-muted">Adds a second step to sign-in. Strongly recommended for owners and finance roles.</p><SubmitButton pending="Preparing…">Set up two-factor</SubmitButton></form>
        )}
      </FormCard>
      <FormCard title="Where you're signed in" className="max-w-prose">
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-1 text-sm">
              <span><span className="block">{(s.user_agent ?? "Unknown device").slice(0, 70)}</span><span className="text-xs text-muted">Last active {new Date(s.last_seen_at).toLocaleString("en-GB")}{s.id === u.sessionId && " · this device"}</span></span>
              {s.id !== u.sessionId && <form action={revokeSession}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="secondary" pending="…">Sign out</SubmitButton></form>}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && <form action={revokeOthers}><SubmitButton variant="secondary" pending="Signing out…">Sign out all other devices</SubmitButton></form>}
      </FormCard>
    </main>
  );
}
