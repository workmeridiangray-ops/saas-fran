import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-form p-3 pt-8">
      <h1 className="text-xl font-semibold">We can't find that</h1>
      <p className="mt-1 text-sm text-muted">It may have been removed, or it may belong to a different workspace or be outside your access. Nothing was changed.</p>
      <Link href="/" className="mt-2 inline-flex min-h-touch items-center text-sm font-medium text-brand">Go to the command centre</Link>
    </main>
  );
}
