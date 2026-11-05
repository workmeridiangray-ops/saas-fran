import { Alert } from "@/components/ui";

/** Shows the outcome of the last action: what happened and what was saved (or not). */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div className="mb-2 max-w-prose">
      {err ? <Alert tone="danger" title="That didn't go through">{err} Nothing was saved.</Alert> : <Alert tone="ok" title={ok!} />}
    </div>
  );
}
export type Flashable = { ok?: string; err?: string };

export function NoAccess({ what }: { what: string }) {
  return (
    <div role="alert" className="mx-auto mt-6 max-w-form rounded-lg border border-line bg-surface p-4 text-center">
      <h1 className="text-lg font-semibold">You don't have access to {what}</h1>
      <p className="mt-0.5 text-sm text-muted">Your role doesn't include it. Ask a company administrator if you need it.</p>
    </div>
  );
}
export function PlanGate({ module }: { module: string }) {
  return (
    <div role="status" className="mx-auto mt-6 max-w-form rounded-lg border border-dashed border-line-strong bg-surface p-4 text-center">
      <h1 className="text-lg font-semibold">{module} isn't on your plan</h1>
      <p className="mt-0.5 text-sm text-muted">Your existing data is safe. Upgrade your plan to use this module.</p>
      <a href="/billing" className="mt-2 inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">See plans</a>
    </div>
  );
}

export function ReadOnly() {
  return (
    <div role="status" className="mx-auto mt-6 max-w-form rounded-lg border border-line bg-surface p-4 text-center">
      <h1 className="text-lg font-semibold">This workspace is read-only</h1>
      <p className="mt-0.5 text-sm text-muted">There's an unpaid invoice. Nothing was lost: everything is still here to view and export. Pay the invoice and editing resumes straight away.</p>
      <a href="/billing" className="mt-2 inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Go to plan & billing</a>
    </div>
  );
}
