import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { completeInspection } from "../actions";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";
import type { TemplateItem } from "@/lib/rules/inspection";

const SEV: Record<string, Tone> = { minor: "neutral", major: "warn", critical: "danger" };

export default async function InspectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "inspections", { module: "inspections", what: "inspections" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const i = await db.one<{ id: string; status: string; scheduled_for: string; completed_at: string | null; score: string | null; critical_failed: boolean; answers: { answers?: Record<string, string>; comments?: Record<string, string> }; inspector_id: string; branch: string; template: string; items: TemplateItem[] }>(
      "select i.*, b.name branch, t.name template, t.items from inspections i join branches b on b.id = i.branch_id join inspection_templates t on t.id = i.template_id where i.id = $1", [id]);
    return i ? { i, findings: await db.q<{ id: string; text: string; severity: string; status: string }>("select id, text, severity, status from findings where inspection_id = $1 order by created_at", [id]) } : null;
  });
  if (!d) notFound(); const { i } = d; const mayConduct = i.status === "scheduled" && (i.inspector_id === ctx.user.id || ctx.has("approve", "inspections"));
  const ans = i.answers?.answers ?? {}; const com = i.answers?.comments ?? {};
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/inspections" className="text-brand">Inspections</Link> / {i.branch}</nav>
      <PageHeader title={`${i.template} · ${i.branch}`} description={`Scheduled ${fmtDate(i.scheduled_for)}`} actions={<Status tone={i.status === "completed" ? "ok" : "info"}>{titleCase(i.status)}</Status>} />
      <Flash ok={ok} err={err} />
      {i.status === "completed" && (
        <div className="mb-3 space-y-2"><Panel><p className="text-sm text-muted">Score</p><p className="text-3xl font-semibold tabular-nums">{Number(i.score)}%</p>{i.critical_failed && <Alert tone="danger" title="Critical failure">The score is capped at 70% because a critical item failed.</Alert>}</Panel>
          {d.findings.length > 0 && <Panel title="Findings"><ul className="divide-y divide-line">{d.findings.map((f) => <li key={f.id} className="flex items-center justify-between gap-2 py-1 text-sm"><Link className="font-medium text-brand" href={`/inspections/findings/${f.id}`}>{f.text}</Link><span className="flex gap-1"><Status tone={SEV[f.severity]!}>{titleCase(f.severity)}</Status><Status tone={f.status === "verified" ? "ok" : "warn"}>{titleCase(f.status)}</Status></span></li>)}</ul></Panel>}</div>)}
      {mayConduct ? (
        <form action={completeInspection} className="max-w-prose space-y-1.5"><input type="hidden" name="id" value={id} />
          <ul className="space-y-1.5">{i.items.map((it) => (
            <li key={it.id} className="rounded-lg border border-line bg-surface p-2"><fieldset><legend className="text-sm font-medium">{it.text} <span className="text-xs font-normal text-muted">weight {it.weight}{it.critical ? " · critical" : ""}</span></legend>
              <div className="mt-1 flex flex-wrap gap-1">{[["pass", "Pass"], ["fail", "Fail"], ["na", "N/A"]].map(([v, l]) => <label key={v} className="inline-flex min-h-touch cursor-pointer items-center rounded-md border border-line-strong px-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft"><input type="radio" name={`a:${it.id}`} value={v} className="sr-only" />{l}</label>)}</div>
              <input name={`c:${it.id}`} placeholder="What you found (required if failed)" aria-label={`Comment for ${it.text}`} className="mt-1 min-h-touch w-full rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></fieldset></li>))}</ul>
          <p className="text-xs text-muted">Failed items become findings. You can attach photos to each finding afterwards.</p>
          <SubmitButton pending="Scoring…">Complete inspection</SubmitButton></form>
      ) : i.status === "completed" ? (
        <TableWrap label="Results"><thead><tr><Th>Item</Th><Th>Result</Th><Th>Comment</Th></tr></thead><tbody>{i.items.map((it) => <tr key={it.id}><Td>{it.text}</Td><Td><Status tone={ans[it.id] === "pass" ? "ok" : ans[it.id] === "fail" ? "danger" : "neutral"}>{ans[it.id] === "na" ? "N/A" : titleCase(ans[it.id] ?? "")}</Status></Td><Td>{com[it.id] || "—"}</Td></tr>)}</tbody></TableWrap>
      ) : <p className="text-sm text-muted">Only the assigned inspector can conduct this inspection.</p>}
    </>
  );
}
