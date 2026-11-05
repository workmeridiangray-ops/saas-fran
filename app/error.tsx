"use client";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-form p-3 pt-8" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">The page couldn't be shown. Nothing you submitted was changed by this error. Try again; if it keeps happening, contact support and quote this reference{error.digest ? `: ${error.digest}` : "."}</p>
      <div className="mt-2 flex gap-1"><button onClick={reset} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Try again</button><a href="/" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Go to the command centre</a></div>
    </main>
  );
}
