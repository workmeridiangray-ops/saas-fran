import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addShift, approveLeave, cancelLeave, declineLeave, removeShift, requestLeave } from "./actions";
import { branchOptions, memberOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, StateMessage, Status, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Roster & leave" };
const LTONE: Record<string, Tone> = { pending: "info", approved: "ok", rejected: "danger", cancelled: "neutral" };

export default async function Roster({ searchParams }: { searchParams: Promise<{ tab?: string; week?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "people", { module: "people", what: "the roster" }); if (denied) return denied;
  const { tab = "week", week, ok, err } = await searchParams;
  const base = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(week + "T00:00:00Z") : new Date(); const monday = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - ((base.getUTCDay() + 6) % 7)));
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000)); const iso = (d: Date) => d.toISOString().slice(0, 10);
  const edit = ctx.has("edit", "people"), approve = ctx.has("approve", "people");
  const d = await asUser(ctx.user.id, async (db) => ({
    shifts: await db.q<{ id: string; day: string; branch: string; who: string; s: string; e: string; note: string; user_id: string; tz: string }>(
      "select s.id, (s.starts_at at time zone b.timezone)::date::text as day, b.name branch, coalesce(nullif(p.display_name,''), p.email) who, to_char(s.starts_at at time zone b.timezone, 'HH24:MI') s, to_char(s.ends_at at time zone b.timezone, 'HH24:MI') e, s.note, s.user_id, b.timezone tz from shifts s join branches b on b.id = s.branch_id join profiles p on p.id = s.user_id where s.company_id = $1 and (s.starts_at at time zone b.timezone)::date between $2 and $3 order by 2, 3, s.starts_at", [ctx.companyId, iso(days[0]!), iso(days[6]!)]),
    mine: await db.q<{ id: string; from_date: string; to_date: string; kind: string; status: string; reason: string; decision_note: string | null }>("select id, from_date::text, to_date::text, kind, status, reason, decision_note from leave_requests where user_id = $1 and company_id = $2 order by from_date desc limit 30", [ctx.user.id, ctx.companyId]),
    pending: approve ? await db.q<{ id: string; who: string; from_date: string; to_date: string; kind: string; reason: string }>("select l.id, coalesce(nullif(p.display_name,''), p.email) who, l.from_date::text, l.to_date::text, l.kind, l.reason from leave_requests l join profiles p on p.id = l.user_id where l.company_id = $1 and l.status = 'pending' and l.user_id <> $2 order by l.from_date", [ctx.companyId, ctx.user.id]) : [],
    branches: edit ? await branchOptions(db, ctx.companyId) : [], people: edit ? await memberOptions(db, ctx.companyId) : [],
    onLeave: await db.q<{ who: string; from_date: string; to_date: string }>("select coalesce(nullif(p.display_name,''), p.email) who, l.from_date::text, l.to_date::text from leave_requests l join profiles p on p.id = l.user_id where l.company_id = $1 and l.status = 'approved' and l.to_date >= $2 and l.from_date <= $3", [ctx.companyId, iso(days[0]!), iso(days[6]!)]),
  }));
  const gaps = edit ? d.branches.filter((b) => d.shifts.some((s) => s.branch === b.name)).flatMap((b) => days.filter((x) => !d.shifts.some((s) => s.branch === b.name && s.day === iso(x))).map((x) => `${b.name}, ${x.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`)) : [];
  const tabLink = (k: string, l: string) => <Link key={k} href={`/roster?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  return (
    <>
      <PageHeader title="Roster & leave" description="Who works where, and time off. Nobody can be on two shifts at once or rostered during approved leave." />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap gap-1">{tabLink("week", "Roster")}{tabLink("leave", "My leave")}{approve && tabLink("approvals", `Leave to decide (${d.pending.length})`)}</div>
      {tab === "week" && (<>
        <div className="mb-2 flex items-center gap-2 text-sm"><Link className="font-medium text-brand" href={`/roster?week=${iso(new Date(monday.getTime() - 7 * 86_400_000))}`}>← Previous week</Link><span className="font-medium">Week of {fmtDate(monday)}</span><Link className="font-medium text-brand" href={`/roster?week=${iso(new Date(monday.getTime() + 7 * 86_400_000))}`}>Next week →</Link></div>
        {gaps.length > 0 && <div className="mb-2 max-w-prose"><Alert tone="warn" title={`${gaps.length} day${gaps.length > 1 ? "s" : ""} with nobody rostered`}><ul className="list-disc pl-3">{gaps.slice(0, 6).map((g) => <li key={g}>{g}</li>)}{gaps.length > 6 && <li>and {gaps.length - 6} more</li>}</ul></Alert></div>}
        {d.onLeave.length > 0 && <p className="mb-2 text-sm text-muted">On approved leave this week: {d.onLeave.map((l) => `${l.who} (${fmtDate(l.from_date)} to ${fmtDate(l.to_date)})`).join("; ")}</p>}
        {d.shifts.length === 0 ? <StateMessage title="Nothing rostered this week">{edit ? "Add shifts below." : "Your shifts appear here once your manager adds them."}</StateMessage> : (
          <div className="grid gap-2 md:grid-cols-7">{days.map((x) => { const list = d.shifts.filter((s) => s.day === iso(x)); return (
            <section key={iso(x)} aria-label={x.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })} className="rounded-lg border border-line bg-surface p-1.5"><h2 className="mb-1 text-xs font-semibold text-muted">{x.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</h2>
              <ul className="space-y-1">{list.map((s) => <li key={s.id} className={`rounded-md border p-1 text-xs ${s.user_id === ctx.user.id ? "border-brand bg-brand-soft" : "border-line bg-canvas"}`}><span className="font-medium">{s.who}</span><br />{s.s}–{s.e} · {s.branch}{s.note && <><br /><span className="text-muted">{s.note}</span></>}
                {edit && <form action={removeShift} className="mt-0.5"><input type="hidden" name="id" value={s.id} /><button className="min-h-touch text-xs font-medium text-danger">Remove</button></form>}</li>)}{list.length === 0 && <li className="text-xs text-muted">—</li>}</ul></section>); })}</div>)}
        {edit && d.branches.length > 0 && <div className="mt-3"><FormCard title="Add a shift"><form action={addShift} className="space-y-2"><div className="grid gap-2 sm:grid-cols-2"><Select label="Branch" name="branch_id" options={d.branches.map((b) => ({ value: b.id, label: b.name }))} /><Select label="Person" name="user_id" options={d.people.map((p) => ({ value: p.user_id, label: p.name }))} /></div>
          <div className="grid gap-2 sm:grid-cols-3"><Field label="Day" name="day" type="date" required defaultValue={iso(days[0]!)} /><Field label="From" name="from" type="time" required defaultValue="09:00" /><Field label="To" name="to" type="time" required defaultValue="17:00" /></div><Field label="Note" name="note" /><SubmitButton pending="Adding…">Add shift</SubmitButton><p className="text-xs text-muted">Times are in the branch's own time zone.</p></form></FormCard></div>}
      </>)}
      {tab === "leave" && (<div className="grid gap-3 lg:grid-cols-2">
        <Panel title="My requests">{d.mine.length === 0 ? <p className="text-sm text-muted">No leave requested yet.</p> : <ul className="divide-y divide-line">{d.mine.map((l) => <li key={l.id} className="flex items-start justify-between gap-2 py-1.5 text-sm"><span><span className="font-medium">{fmtDate(l.from_date)} to {fmtDate(l.to_date)}</span> · {titleCase(l.kind)}{l.decision_note && <span className="block text-xs text-muted">{l.decision_note}</span>}</span><span className="flex items-center gap-1"><Status tone={LTONE[l.status] ?? "neutral"}>{titleCase(l.status)}</Status>{l.status === "pending" && <form action={cancelLeave}><input type="hidden" name="id" value={l.id} /><SubmitButton variant="secondary" pending="…">Cancel</SubmitButton></form>}</span></li>)}</ul>}</Panel>
        <FormCard title="Request leave"><form action={requestLeave} className="space-y-2"><div className="grid gap-2 sm:grid-cols-2"><Field label="First day" name="from" type="date" required /><Field label="Last day" name="to" type="date" required /></div><Select label="Type" name="kind" options={[{ value: "annual", label: "Annual leave" }, { value: "sick", label: "Sick leave" }, { value: "unpaid", label: "Unpaid" }, { value: "other", label: "Other" }]} /><Field label="Reason (optional)" name="reason" /><SubmitButton pending="Sending…">Request leave</SubmitButton></form></FormCard></div>)}
      {tab === "approvals" && approve && (d.pending.length === 0 ? <StateMessage title="No leave waiting for you">Requests from your team appear here.</StateMessage> : (
        <div className="space-y-2">{d.pending.map((l) => <Panel key={l.id} title={`${l.who}: ${fmtDate(l.from_date)} to ${fmtDate(l.to_date)}`}><p className="text-sm text-muted">{titleCase(l.kind)}{l.reason ? ` · ${l.reason}` : ""}</p>
          <form className="mt-1.5 flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={l.id} /><div className="min-w-[14rem] flex-1"><Field label="Note (required to decline)" name="note" /></div><button formAction={approveLeave} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Approve</button><button formAction={declineLeave} className="inline-flex min-h-touch items-center rounded-md border border-danger px-3 text-sm font-medium text-danger">Decline</button></form></Panel>)}</div>))}
    </>
  );
}
