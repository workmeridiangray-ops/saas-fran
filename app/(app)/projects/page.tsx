import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Opening projects" };
const TONE: Record<string, Tone> = { planning: "neutral", in_progress: "info", launched: "ok", cancelled: "neutral" };

export default async function Projects({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "projects", { module: "projects", what: "opening projects" }); if (denied) return denied;
  const { ok, err } = await searchParams;
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string; status: string; target_launch: string | null; branch: string | null; req: string; done: string; blocked: string }>(
    `select p.id, p.name, p.status, p.target_launch, b.name branch,
            (select count(*) from project_items i where i.project_id = p.id and i.required) req,
            (select count(*) from project_items i where i.project_id = p.id and i.required and i.status = 'done') done,
            (select count(*) from project_items i where i.project_id = p.id and i.status = 'blocked') blocked
       from projects p left join branches b on b.id = p.branch_id where p.company_id = $1 order by (p.status = 'launched'), p.target_launch nulls last`, [ctx.companyId]));
  return (
    <>
      <PageHeader title="Opening projects" description="Get a new branch ready: site, fit-out, equipment, people, licences and training, with a launch gate." actions={ctx.has("create", "projects") ? <ButtonLink href="/projects/new" variant="primary">New project</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      {rows.length === 0 ? <StateMessage title="No opening projects yet" actions={<ButtonLink href="/projects/new" variant="primary">Start one</ButtonLink>}>A project starts from a checklist written for your industry, with owners, deadlines, evidence and a launch approval.</StateMessage> : (
        <TableWrap label="Opening projects"><thead><tr><Th>Project</Th><Th>Branch</Th><Th>Target</Th><Th num>Ready</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((r) => { const pct = Number(r.req) ? Math.round((Number(r.done) / Number(r.req)) * 100) : 0; return <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/projects/${r.id}`}>{r.name}</Link></Td><Td>{r.branch ?? "—"}</Td><Td>{r.target_launch ? fmtDate(r.target_launch) : "—"}</Td><Td num>{pct}% ({r.done}/{r.req})</Td>
            <Td><Status tone={TONE[r.status] ?? "neutral"}>{titleCase(r.status)}</Status>{Number(r.blocked) > 0 && <> <Status tone="danger">{r.blocked} blocked</Status></>}</Td></tr>; })}</tbody></TableWrap>)}
    </>
  );
}
