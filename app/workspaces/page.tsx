import Link from "next/link";
import { workspaces } from "@/lib/demo/data";

export const metadata = { title: "Choose workspace" };

export default function Workspaces() {
  return (
    <main className="mx-auto max-w-form p-3 pt-8">
      <h1 className="text-2xl font-semibold">Choose a workspace</h1>
      <p className="mt-0.5 text-sm text-muted">You belong to more than one company. Switching changes everything you see; data is never mixed between companies.</p>
      <ul className="mt-3 space-y-1.5">
        {workspaces.map((w) => (
          <li key={w.id}>
            <Link href="/" className="flex min-h-touch items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 shadow-raised hover:border-line-strong">
              <span><span className="block font-medium">{w.name}</span><span className="text-xs text-muted">{w.role}</span></span>
              <span className="text-sm font-medium text-brand">Open</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">Don't see your company? <Link className="font-medium text-brand" href="/m/request-access">Request access</Link></p>
    </main>
  );
}
