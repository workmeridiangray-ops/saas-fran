import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { approveRequest, cancelRequest, deleteRule, rejectRequest, saveRule } from "./actions";
import { Attachments } from "@/components/records/Attachments";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Alert, PageHeader, Panel, StateMessage, Status, type Tone } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { formatMinor } from "@/lib/rules/money";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Approvals" };
const TONE: Record<string, Tone> = { pending: "info", approved: "ok", rejected: "danger", cancelled: "neutral" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ open?: string; tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "approvals", { what: "approvals" }); if (denied) return denied;
  const { open, tab = "inbox", ok, err } = await searchParams;
  const money = (n: number) => formatMinor(n, ctx.company.currency);

  if (tab === "rules") {
    const d = await asUser(ctx.user.id, async (db) => ({
      rules: await db.q<{ id: string; name: string; kind: string; min_amount_minor: string | null; max_amount_minor: string | null; steps: { label: string }[] }>("select id, name, kind, min_amount_minor, max_amount_minor, steps from approval_rules where company_id = $1 order by kind, min_amount_minor nulls first", [ctx.companyId]),
      roles: await db.q<{ id: string; name: string }>("select id, name from roles where company_id = $1 order by name", [ctx.companyId]),
    }));
    const canConfig = ctx.has("configure", "approvals"); const roleOpts = d.roles.map((r) => ({ value: r.id, label: r.name }));
    return (
      <>
        <PageHeader title="Approval rules" description="Who must approve what. The most specific matching rule wins." actions={<Link href="/approvals" className="inline-flex min-h-touch items-center text-sm font-medium text-brand">Back to inbox</Link>} />
        <Flash ok={ok} err={err} />
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Current rules"><ul className="divide-y divide-line">{d.rules.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-1 py-1 text-sm"><span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{titleCase(r.kind)}{r.min_amount_minor !== null ? ` · from ${money(Number(r.min_amount_minor))}` : ""}{r.max_amount_minor !== null ? ` · up to ${money(Number(r.max_amount_minor))}` : ""} · {r.steps.map((s) => s.label).join(" → ")}</span></span>
              {canConfig && <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><SubmitButton variant="secondary" pending="…">Remove</SubmitButton></form>}</li>))}</ul></Panel>
          {canConfig && <FormCard title="Add a rule"><form action={saveRule} className="space-y-2">
            <Field label="Name" name="name" required /><Select label="Applies to" name="kind" options={[{ value: "purchase", label: "Purchase requests" }]} />
            <div className="grid grid-cols-2 gap-2"><Field label={`From amount (${ctx.company.currency})`} name="min" type="number" step="0.01" min="0" /><Field label="Up to amount" name="max" type="number" step="0.01" min="0" /></div>
            <Select label="Step 1 approver" name="step1" options={roleOpts} /><Select label="Step 2 (optional)" name="step2" options={roleOpts} placeholder="None" /><Select label="Step 3 (optional)" name="step3" options={roleOpts} placeholder="None" />
            <Field label="Priority" name="priority" type="number" defaultValue="1" hint="Breaks ties between equally specific rules." /><SubmitButton>Add rule</SubmitButton></form></FormCard>}
        </div>
      </>
    );
  }

  const d = await asUser(ctx.user.id, async (db) => {
    const list = await db.q<{ id: string; title: string; kind: string; status: string; amount_minor: string; branch: string | null; requester_id: string; requester: string | null; created_at: string; current_step: number; steps: { role_id: string; label: string }[]; subject_id: string }>(
      `select r.id, r.title, r.kind, r.status, r.amount_minor, b.name branch, r.requester_id, coalesce(nullif(p.display_name,''), p.email) requester, r.created_at, r.current_step, r.steps, r.subject_id
         from approval_requests r left join branches b on b.id = r.branch_id left join profiles p on p.id = r.requester_id
        where r.company_id = $1 and ($2 = 'inbox' and r.status = 'pending' or $2 = 'mine' and r.requester_id = $3 or $2 = 'decided' and r.status <> 'pending')
        order by r.created_at desc limit 100`, [ctx.companyId, tab, ctx.user.id]);
    const sel = list.find((r) => r.id === open) ?? list[0] ?? null;
    if (!sel) return { list, sel: null, history: [], lines: [], solo: false };
    const history = await db.q<{ step: number; outcome: string; reason: string | null; decided_at: string; who: string | null }>("select d.step, d.outcome, d.reason, d.decided_at, coalesce(nullif(p.display_name,''), p.email) who from approval_decisions d left join profiles p on p.id = d.decided_by where d.request_id = $1 order by d.decided_at", [sel.id]);
    const lines = sel.kind === "purchase" ? await db.q<{ name: string; qty: string; unit_price_minor: string }>("select i.name, l.qty, l.unit_price_minor from requisition_lines l join catalog_items i on i.id = l.item_id where l.requisition_id = $1", [sel.subject_id]) : [];
    const solo = (await db.one<{ s: boolean }>("select app.sole_member($1) s", [ctx.companyId]))!.s;   // same rule the database applies to self-approval
    return { list, sel, history, lines, solo };
  });
  const sel = d.sel;
  const tabLink = (k: string, l: string) => <Link key={k} href={`/approvals?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  return (
    <>
      <PageHeader title="Approvals" description="Review the request, evidence and impact together, then decide." actions={ctx.has("configure", "approvals") ? <Link href="/approvals?tab=rules" className="inline-flex min-h-touch items-center text-sm font-medium text-brand">Approval rules</Link> : undefined} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap gap-1">{tabLink("inbox", "Waiting")}{tabLink("mine", "My requests")}{tabLink("decided", "Decided")}</div>
      {!sel ? <StateMessage title={tab === "inbox" ? "Nothing is waiting for a decision" : "Nothing here yet"}>Requests that need approval, such as purchase requests, appear here with their evidence and history.</StateMessage> : (
        <div className="grid gap-3 lg:grid-cols-[20rem_1fr]">
          <nav aria-label="Requests"><ul className="space-y-1">{d.list.map((a) => (
            <li key={a.id}><Link href={`/approvals?tab=${tab}&open=${a.id}`} aria-current={a.id === sel.id ? "page" : undefined} className={`block rounded-md border p-1.5 ${a.id === sel.id ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-sunken"}`}>
              <span className="flex items-baseline justify-between gap-1"><span className="text-sm font-medium">{a.title}</span><span className="num text-sm">{money(Number(a.amount_minor))}</span></span>
              <span className="text-xs text-muted">{a.branch ?? "Company"} · {a.requester ?? "—"} · {titleCase(a.status)}</span></Link></li>))}</ul></nav>
          <article aria-labelledby="req-title" className="space-y-2">
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-xs text-muted">{titleCase(sel.kind)} · requested {fmtDateTime(sel.created_at, ctx.company.timezone)}</p><h2 id="req-title" className="text-xl font-semibold">{sel.title}</h2><p className="text-sm text-muted">{sel.branch ?? "Company-wide"} · by {sel.requester ?? "—"}</p></div>
                <Status tone={TONE[sel.status] ?? "neutral"}>{titleCase(sel.status)}</Status></div>
              <dl className="mt-2 grid gap-2 sm:grid-cols-3"><div><dt className="text-xs text-muted">Amount</dt><dd className="num !text-left text-lg font-semibold">{money(Number(sel.amount_minor))}</dd></div>
                <div><dt className="text-xs text-muted">Route</dt><dd className="text-sm">{sel.steps.map((s, i) => <span key={i} className={i === sel.current_step && sel.status === "pending" ? "font-semibold" : "text-muted"}>{i > 0 && " → "}{s.label}</span>)}</dd></div>
                {sel.kind === "purchase" && <div><dt className="text-xs text-muted">Record</dt><dd className="text-sm"><Link className="font-medium text-brand" href={`/purchasing/${sel.subject_id}`}>Open requisition</Link></dd></div>}</dl>
              {d.lines.length > 0 && <table className="mt-2 w-full text-sm"><caption className="sr-only">Requested items</caption><thead><tr><th scope="col" className="py-0.5 text-left text-xs text-muted">Item</th><th scope="col" className="num py-0.5 text-xs text-muted">Qty</th><th scope="col" className="num py-0.5 text-xs text-muted">Unit price</th></tr></thead>
                <tbody>{d.lines.map((l, i) => <tr key={i} className="border-t border-line"><td className="py-0.5">{l.name}</td><td className="num">{Number(l.qty)}</td><td className="num">{money(Number(l.unit_price_minor))}</td></tr>)}</tbody></table>}
            </Panel>
            <Attachments ctx={ctx} table="approval_requests" id={sel.id} back={`/approvals?tab=${tab}&open=${sel.id}`} canUpload={sel.status === "pending"} title="Supporting evidence" />
            <Panel title="Previous decisions">{d.history.length === 0 ? <p className="text-sm text-muted">No decisions yet.</p> : <ol className="space-y-1">{d.history.map((h, i) => <li key={i} className="text-sm"><strong className="font-medium">{h.who ?? "—"}</strong>: {h.outcome} step {h.step + 1}{h.reason ? ` — “${h.reason}”` : ""} <span className="text-xs text-muted">{fmtDateTime(h.decided_at, ctx.company.timezone)}</span></li>)}</ol>}</Panel>
            {sel.status === "pending" && (sel.requester_id === ctx.user.id && !d.solo ? (
              <Panel title="Your request"><p className="mb-1 text-sm text-muted">Waiting for {sel.steps[sel.current_step]?.label ?? "an approver"}.</p><form action={cancelRequest}><input type="hidden" name="id" value={sel.id} /><SubmitButton variant="secondary" pending="Withdrawing…">Withdraw request</SubmitButton></form></Panel>
            ) : ctx.has("approve", "approvals") ? (
              <Panel title={`Your decision · step ${sel.current_step + 1} of ${sel.steps.length}`}><form className="space-y-2"><input type="hidden" name="id" value={sel.id} />
                <TextArea label="Reason" name="reason" hint="Required to reject. Kept in the audit trail." />
                <div className="flex flex-wrap gap-1"><button formAction={approveRequest} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Approve</button><button formAction={rejectRequest} className="inline-flex min-h-touch items-center rounded-md border border-danger px-3 text-sm font-medium text-danger">Reject with reason</button></div></form></Panel>
            ) : <Alert tone="info" title="You can view this request but not decide it" />)}
          </article>
        </div>)}
    </>
  );
}
