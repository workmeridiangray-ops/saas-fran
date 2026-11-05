"use client";
import { useActionState } from "react";
import { confirmTotp, type TotpState } from "@/app/account/actions";
import { SubmitButton } from "@/components/ui/forms";
import { Field } from "@/components/ui/fields";

export function TotpConfirm() {
  const [state, action] = useActionState<TotpState, FormData>(confirmTotp, {});
  if (state.codes) return (
    <div role="status" className="space-y-1.5">
      <p className="text-sm font-semibold text-ok">Two-factor authentication is on.</p>
      <p className="text-sm">Save these recovery codes now. Each works once if you lose your phone. <strong>They won't be shown again.</strong></p>
      <ul className="grid grid-cols-2 gap-1 rounded-md bg-sunken p-2 font-mono text-sm" aria-label="Recovery codes">{state.codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <a className="text-sm font-medium text-brand" href="/account">I've saved them</a>
    </div>
  );
  return (
    <form action={action} className="space-y-1.5">
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <Field label="Code from your app" name="code" inputMode="numeric" autoComplete="one-time-code" required />
      <SubmitButton pending="Checking…">Turn on two-factor</SubmitButton>
    </form>
  );
}
