import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { saveRole } from "../actions";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";
import { ACTIONS, RESOURCES, type Grant } from "@/lib/rules/permissions";
import { titleCase } from "@/lib/format";

export const metadata = { title: "Roles" };

export default async function Roles({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; role?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "users", { module: "people", what: "roles" }); if (denied) return denied;
  const { ok, err, role } = await searchParams;
  const roles = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string; grants: Grant[] }>("select id, name, grants from roles where company_id = $1 order by name", [ctx.companyId]));
  const cur = roles.find((r) => r.id === role);
  const has = (r: string, a: string) => cur?.grants.some((g) => (g.resource === "*" || g.resource === r) && (g.actions === "*" || g.actions.includes(a as never))) ?? false;
  const canConfigure = ctx.has("configure", "users");
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/people" className="text-brand">People & access</Link> / Roles</nav>
      <PageHeader title="Roles" description="A role is a bundle of permissions. Branch scope is set per person, not per role." />
      <Flash ok={ok} err={err} />
      <div className="mb-3 flex flex-wrap gap-1">
        {roles.map((r) => <Link key={r.id} href={`/people/roles?role=${r.id}`} aria-current={r.id === role ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${r.id === role ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-sunken"}`}>{r.name}</Link>)}
        <Link href="/people/roles" className="inline-flex min-h-touch items-center rounded-md border border-dashed border-line-strong px-2 text-sm font-medium text-brand">New role</Link>
      </div>
      {cur?.name === "Company owner" ? <p className="text-sm text-muted">The owner role has full access and can't be edited.</p> : canConfigure ? (
        <FormCard title={cur ? `Edit “${cur.name}”` : "New role"} className="max-w-none">
          <form action={saveRole} className="space-y-2">
            <input type="hidden" name="id" value={cur?.id ?? ""} />
            <div className="max-w-form"><Field label="Role name" name="name" defaultValue={cur?.name ?? ""} required /></div>
            <div role="region" aria-label="Permissions" tabIndex={0} className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[44rem] text-sm"><thead><tr><th scope="col" className="bg-sunken px-2 py-1 text-left text-xs font-semibold text-muted">Area</th>
                {ACTIONS.map((a) => <th key={a} scope="col" className="bg-sunken px-1 py-1 text-center text-xs font-semibold text-muted">{titleCase(a)}</th>)}<th scope="col" className="bg-sunken px-1 py-1 text-center text-xs font-semibold text-muted">Own only</th></tr></thead>
                <tbody>{RESOURCES.map((r) => (
                  <tr key={r} className="border-t border-line"><th scope="row" className="px-2 py-0.5 text-left font-medium">{titleCase(r)}</th>
                    {ACTIONS.map((a) => <td key={a} className="text-center"><label className="inline-flex min-h-touch min-w-touch items-center justify-center"><input type="checkbox" name={`g:${r}:${a}`} defaultChecked={has(r, a)} aria-label={`${titleCase(a)} ${r}`} /></label></td>)}
                    <td className="text-center"><label className="inline-flex min-h-touch min-w-touch items-center justify-center"><input type="checkbox" name={`own:${r}`} defaultChecked={cur?.grants.some((g) => g.resource === r && g.ownOnly)} aria-label={`Own records only for ${r}`} /></label></td></tr>))}</tbody></table>
            </div>
            <p className="text-xs text-muted">“Own only” limits that area to records assigned to or created by the person. Changes apply the next time they load a page.</p>
            <SubmitButton>Save role</SubmitButton>
          </form>
        </FormCard>
      ) : <p className="text-sm text-muted">You can view roles but not change them.</p>}
    </>
  );
}
