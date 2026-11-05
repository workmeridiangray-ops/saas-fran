"use client";
import { startTransition, useActionState } from "react";
import type { Once } from "@/app/(app)/integrations/actions";

/** Shows a secret exactly once, in the page, after creation. It is never put in a URL. */
export function OnceForm({ action, children, button }: { action: (p: Once, f: FormData) => Promise<Once>; children: React.ReactNode; button: string }) {
  const [state, run, pending] = useActionState<Once, FormData>(action, {});
  if (state.secret) return (
    <div role="status" className="space-y-1.5">
      <p className="text-sm font-semibold text-ok">Created. Copy the {state.label} now.</p>
      <p className="text-sm">It <strong>won't be shown again</strong>. If you lose it, create a new one.</p>
      <input readOnly aria-label={`Your new ${state.label}`} value={state.secret} onFocus={(e) => e.currentTarget.select()} className="min-h-touch w-full rounded-md border border-line-strong bg-sunken px-1.5 font-mono text-sm" />
      <a href="/integrations" className="text-sm font-medium text-brand">I've saved it</a>
    </div>
  );
  // Submitted in script (not as a form action) so a validation error leaves what was typed in place.
  return (<form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => run(fd)); }} className="space-y-2">{state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}{children}
    <button type="submit" disabled={pending} className="inline-flex min-h-touch items-center justify-center rounded-md bg-brand px-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60">{pending ? "Creating…" : button}</button></form>);
}
