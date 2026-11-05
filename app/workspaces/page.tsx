import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, setWorkspace } from "@/lib/auth/session";
import { myWorkspaces } from "@/lib/ctx";
import { signOut } from "../(auth)/actions";

export const metadata = { title: "Choose workspace" };

async function choose(f: FormData) {
  "use server";
  const u = await requireUser(); const id = String(f.get("id") ?? "");
  const mine = await myWorkspaces(u.id);
  if (!mine.some((w) => w.company_id === id)) redirect("/workspaces");   // never trust the posted id
  await setWorkspace(id);
  redirect("/");
}

export default async function Workspaces() {
  const u = await requireUser(); const ws = await myWorkspaces(u.id);
  if (ws.length === 0) redirect("/onboarding");
  return (
    <main className="mx-auto max-w-form p-3 pt-8">
      <h1 className="text-2xl font-semibold">Choose a workspace</h1>
      <p className="mt-0.5 text-sm text-muted">Switching changes everything you see. Companies' data is never mixed.</p>
      <ul className="mt-3 space-y-1.5">
        {ws.map((w) => (
          <li key={w.company_id}>
            <form action={choose}>
              <input type="hidden" name="id" value={w.company_id} />
              <button className="flex min-h-touch w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 text-left shadow-raised hover:border-line-strong">
                <span><span className="block font-medium">{w.name}</span><span className="text-xs text-muted">{w.role_names.join(", ")}</span></span>
                <span className="text-sm font-medium text-brand">Open</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between text-sm">
        <Link className="font-medium text-brand" href="/onboarding">Create another company</Link>
        <form action={signOut}><button className="font-medium text-brand">Sign out</button></form>
      </div>
    </main>
  );
}
