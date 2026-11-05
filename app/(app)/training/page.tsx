import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Training" };

export default async function Training({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "training", { module: "training", what: "training" }); if (denied) return denied;
  const { ok, err } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => ({
    mine: await db.q<{ id: string; title: string; status: string; score: number | null; expires_at: string | null; attempts: number; max_attempts: number }>("select c.id, c.title, e.status, e.score, e.expires_at, e.attempts, c.max_attempts from enrolments e join courses c on c.id = e.course_id where e.user_id = $1 and e.company_id = $2 order by e.status = 'passed', c.title", [ctx.user.id, ctx.companyId]),
    courses: await db.q<{ id: string; title: string; pass_mark: number; assigned: string; passed: string }>("select c.id, c.title, c.pass_mark, (select count(*) from enrolments e where e.course_id = c.id) assigned, (select count(*) from enrolments e where e.course_id = c.id and e.status = 'passed' and (e.expires_at is null or e.expires_at > now())) passed from courses c where c.company_id = $1 and c.status = 'active' order by c.title", [ctx.companyId]),
    expiring: await db.q<{ title: string; who: string; expires_at: string }>("select c.title, coalesce(nullif(p.display_name,''), p.email) who, e.expires_at from enrolments e join courses c on c.id = e.course_id join profiles p on p.id = e.user_id where e.company_id = $1 and e.status = 'passed' and e.expires_at < now() + interval '30 days' order by e.expires_at limit 20", [ctx.companyId]),
  }));
  const manage = ctx.has("assign", "training");
  const tone = (s: string, exp: string | null): Tone => (s === "passed" ? (exp && new Date(exp) < new Date() ? "danger" : "ok") : s === "failed" ? "danger" : "info");
  return (
    <>
      <PageHeader title="Training" description="Courses, quizzes, pass marks and certificate expiry." actions={ctx.has("create", "training") ? <ButtonLink href="/training/new" variant="primary">New course</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <h2 className="mb-1 text-sm font-semibold text-muted">My training</h2>
      {d.mine.length === 0 ? <p className="mb-3 text-sm text-muted">Nothing is assigned to you.</p> : (
        <div className="mb-3"><TableWrap label="My training"><thead><tr><Th>Course</Th><Th>Status</Th><Th num>Score</Th><Th>Valid until</Th><Th num>Attempts</Th></tr></thead>
          <tbody>{d.mine.map((m) => <tr key={m.id}><Td><Link className="font-medium text-brand" href={`/training/${m.id}`}>{m.title}</Link></Td><Td><Status tone={tone(m.status, m.expires_at)}>{m.status === "passed" && m.expires_at && new Date(m.expires_at) < new Date() ? "Expired" : m.status === "assigned" ? "To do" : m.status[0]!.toUpperCase() + m.status.slice(1)}</Status></Td><Td num>{m.score ?? "—"}</Td><Td>{m.expires_at ? fmtDate(m.expires_at) : "—"}</Td><Td num>{m.attempts} of {m.max_attempts}</Td></tr>)}</tbody></TableWrap></div>)}
      {manage && <>
        <h2 className="mb-1 text-sm font-semibold text-muted">Courses</h2>
        {d.courses.length === 0 ? <StateMessage title="No courses yet" actions={<ButtonLink href="/training/new" variant="primary">Create a course</ButtonLink>}>Write a lesson and a short quiz, then assign it to staff.</StateMessage> : (
          <TableWrap label="Courses"><thead><tr><Th>Course</Th><Th num>Pass mark</Th><Th num>Assigned</Th><Th num>Currently certified</Th></tr></thead>
            <tbody>{d.courses.map((c) => <tr key={c.id}><Td><Link className="font-medium text-brand" href={`/training/${c.id}`}>{c.title}</Link></Td><Td num>{c.pass_mark}%</Td><Td num>{c.assigned}</Td><Td num>{c.passed}</Td></tr>)}</tbody></TableWrap>)}
        {d.expiring.length > 0 && <div className="mt-3"><h2 className="mb-1 text-sm font-semibold text-muted">Certificates expiring within 30 days</h2><ul className="max-w-prose divide-y divide-line rounded-lg border border-line bg-surface px-2">{d.expiring.map((x, i) => <li key={i} className="flex justify-between py-1 text-sm"><span>{x.who} · {x.title}</span><span className={new Date(x.expires_at) < new Date() ? "text-danger" : "text-warn"}>{fmtDate(x.expires_at)}</span></li>)}</ul></div>}</>}
    </>
  );
}
