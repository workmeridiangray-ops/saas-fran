import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { acknowledge, archiveDocument, publishVersion, saveVersion } from "../actions";
import { TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "documents", { module: "documents", what: "knowledge" }); if (denied) return denied;
  const { id } = await params; const { v, ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canTrack = ctx.has("edit", "documents");
  const d = await asUser(ctx.user.id, async (db) => {
    const doc = await db.one<{ id: string; title: string; kind: string; status: string; current_version: number }>("select id, title, kind, status, current_version from documents where id = $1", [id]);
    if (!doc) return null;
    const versions = await db.q<{ version: number; body: string; published: boolean; created_at: string; who: string | null }>("select v.version, v.body, v.published, v.created_at, coalesce(nullif(p.display_name,''), p.email) who from document_versions v left join profiles p on p.id = v.created_by where v.document_id = $1 order by v.version desc", [id]);
    return { doc, versions, mine: !!(await db.one("select 1 from acknowledgements where document_id = $1 and version = $2 and user_id = $3", [id, doc.current_version, ctx.user.id])),
      acks: await db.q<{ name: string; at: string }>("select coalesce(nullif(p.display_name,''), p.email) name, a.at from acknowledgements a join profiles p on p.id = a.user_id where a.document_id = $1 and a.version = $2 order by a.at", [id, doc.current_version]),
      // Only people who manage documents can see everyone's acknowledgements, so only they get the tracker.
      pending: canTrack ? await db.q<{ name: string }>("select cp.name from public.company_people($1) cp where not exists (select 1 from acknowledgements a where a.document_id = $2 and a.version = $3 and a.user_id = cp.user_id) order by 1", [ctx.companyId, id, doc.current_version]) : [] };
  });
  if (!d) notFound(); const { doc } = d; const canEdit = ctx.has("edit", "documents");
  const shown = d.versions.find((x) => String(x.version) === v) ?? d.versions.find((x) => x.version === doc.current_version) ?? d.versions[0]!;
  const latest = d.versions[0]!; const iAcked = d.mine;
  const canAck = doc.status === "published" && shown.version === doc.current_version;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/knowledge" className="text-brand">Knowledge</Link> / {doc.title}</nav>
      <PageHeader title={doc.title} description={`${titleCase(doc.kind)} · showing v${shown.version}${shown.published ? " (published)" : " (draft)"} · live version v${doc.current_version}`} actions={<Status tone={doc.status === "published" ? "ok" : "neutral"}>{titleCase(doc.status)}</Status>} />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-2">
          <Panel><article className="max-w-prose whitespace-pre-wrap text-base leading-relaxed">{shown.body}</article>
            <p className="mt-2 text-xs text-muted">v{shown.version} by {shown.who ?? "—"}, {fmtDateTime(shown.created_at, ctx.company.timezone)}</p></Panel>
          {canAck && <Panel title="Read and acknowledge">{iAcked ? <p className="text-sm text-ok">You've acknowledged this version.</p> : <form action={acknowledge}><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={shown.version} /><p className="mb-1 text-sm">I have read and understood this document.</p><SubmitButton pending="Recording…">Acknowledge</SubmitButton></form>}</Panel>}
          {canEdit && doc.status !== "archived" && <Panel title="Edit (creates a new draft version)"><form action={saveVersion} className="space-y-1.5"><input type="hidden" name="id" value={id} /><TextArea label="Content" name="body" rows={10} defaultValue={latest.body} /><SubmitButton variant="secondary" pending="Saving…">Save as new version</SubmitButton></form></Panel>}
        </div>
        <div className="space-y-2">
          <Panel title="Versions"><ul className="space-y-0.5">{d.versions.map((x) => <li key={x.version} className="text-sm"><Link className={`font-medium ${x.version === shown.version ? "" : "text-brand"}`} href={`/knowledge/${id}?v=${x.version}`}>v{x.version}</Link> <span className="text-xs text-muted">{x.published ? (x.version === doc.current_version ? "live" : "published earlier") : "draft"}</span></li>)}</ul>
            {canEdit && !shown.published && doc.status !== "archived" && <form action={publishVersion} className="mt-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={shown.version} /><SubmitButton pending="Publishing…">Publish v{shown.version}</SubmitButton><p className="mt-1 text-xs text-muted">Everyone is notified and asked to acknowledge. The previous version is replaced.</p></form>}</Panel>
          {doc.status === "published" && canTrack && <Panel title={`Acknowledgements (v${doc.current_version})`}><p className="text-sm"><strong>{d.acks.length}</strong> of {d.acks.length + d.pending.length}</p>
            {d.pending.length > 0 && <details className="mt-1 text-sm"><summary className="cursor-pointer font-medium text-brand">Not yet acknowledged ({d.pending.length})</summary><ul className="mt-0.5 list-disc pl-3">{d.pending.map((p, i) => <li key={i}>{p.name}</li>)}</ul></details>}</Panel>}
          {canEdit && doc.status !== "archived" && <form action={archiveDocument}><input type="hidden" name="id" value={id} /><SubmitButton variant="danger" pending="Archiving…">Archive document</SubmitButton></form>}
        </div>
      </div>
    </>
  );
}
