import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Knowledge" };
const TONE: Record<string, Tone> = { draft: "neutral", in_review: "info", published: "ok", archived: "neutral" };

export default async function Knowledge({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "documents", { module: "documents", what: "knowledge" }); if (denied) return denied;
  const { q = "", ok, err } = await searchParams;
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; title: string; kind: string; status: string; current_version: number; expires_on: string | null; acked: string; total: string; mine: boolean }>(
    `select d.id, d.title, d.kind, d.status, d.current_version, d.expires_on,
            (select count(*) from acknowledgements a where a.document_id = d.id and a.version = d.current_version) acked,
            (select count(*) from public.company_people(d.company_id)) total,
            exists (select 1 from acknowledgements a where a.document_id = d.id and a.version = d.current_version and a.user_id = $2) mine
       from documents d where d.company_id = $1 and ($3 = '' or d.title ilike '%'||$3||'%') order by (d.status = 'archived'), d.title limit 300`, [ctx.companyId, ctx.user.id, q]));
  const canWrite = ctx.has("create", "documents");
  return (
    <>
      <PageHeader title="Knowledge" description="SOPs, policies and templates, with versions and read-and-acknowledge tracking." actions={canWrite ? <ButtonLink href="/knowledge/new" variant="primary">New document</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <form role="search" aria-label="Search documents" className="mb-2 flex items-end gap-1"><div><label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label><input id="q" name="q" defaultValue={q} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></div><button className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Search</button></form>
      {rows.length === 0 ? <StateMessage title={q ? "No documents match" : "No documents yet"} actions={canWrite ? <ButtonLink href="/knowledge/new" variant="primary">Write the first SOP</ButtonLink> : undefined}>Publish a standard operating procedure and track who has read it.</StateMessage> : (
        <TableWrap label="Documents"><thead><tr><Th>Document</Th><Th>Type</Th><Th>Version</Th><Th>Status</Th><Th num>Acknowledged</Th><Th>Review by</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/knowledge/${r.id}`}>{r.title}</Link>{r.status === "published" && !r.mine && <> <Status tone="warn">Read & confirm</Status></>}</Td><Td>{titleCase(r.kind)}</Td><Td>v{r.current_version}</Td><Td><Status tone={TONE[r.status] ?? "neutral"}>{titleCase(r.status)}</Status></Td><Td num>{r.status === "published" ? `${r.acked} of ${r.total}` : "—"}</Td><Td>{r.expires_on ? fmtDate(r.expires_on) : "—"}</Td></tr>)}</tbody></TableWrap>)}
    </>
  );
}
