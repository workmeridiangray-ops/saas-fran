import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { assignCourse, takeQuiz } from "../actions";
import { memberOptions } from "@/lib/data/pickers";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, Status } from "@/components/ui";
import { attemptsLeft } from "@/lib/rules/training";
import { fmtDate } from "@/lib/format";

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "training", { module: "training", what: "training" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    // The answer key is never selected for learners: only question text and options leave the database layer.
    const c = await db.one<{ id: string; title: string; description: string; lesson: string; pass_mark: number; max_attempts: number; validity_days: number | null; questions: { q: string; options: string[] }[] }>(
      "select id, title, description, lesson, pass_mark, max_attempts, validity_days, (select jsonb_agg(jsonb_build_object('q', x->>'q', 'options', x->'options')) from jsonb_array_elements(questions) x) questions from courses where id = $1", [id]);
    if (!c) return null;
    return { c, e: await db.one<{ status: string; score: number | null; attempts: number; expires_at: string | null }>("select status, score, attempts, expires_at from enrolments where course_id = $1 and user_id = $2", [id, ctx.user.id]),
      people: await memberOptions(db, ctx.companyId),
      roster: await db.q<{ who: string; status: string; score: number | null; expires_at: string | null }>("select coalesce(nullif(p.display_name,''), p.email) who, e.status, e.score, e.expires_at from enrolments e join profiles p on p.id = e.user_id where e.course_id = $1 order by 1", [id]) };
  });
  if (!d) notFound(); const { c, e } = d; const manage = ctx.has("assign", "training");
  const expired = e?.status === "passed" && e.expires_at && new Date(e.expires_at) < new Date();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/training" className="text-brand">Training</Link> / {c.title}</nav>
      <PageHeader title={c.title} description={`${c.description} Pass mark ${c.pass_mark}% · ${c.max_attempts} attempts${c.validity_days ? ` · valid ${c.validity_days} days` : ""}`} />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-2">
          {c.lesson && <Panel title="Lesson"><article className="max-w-prose whitespace-pre-wrap text-base leading-relaxed">{c.lesson}</article></Panel>}
          {e ? (
            e.status === "passed" && !expired ? <Alert tone="ok" title={`You passed with ${e.score}%`}>{e.expires_at ? `Valid until ${fmtDate(e.expires_at)}.` : "This certification doesn't expire."}</Alert> : (
              <Panel title={expired ? "Your certification expired: retake the quiz" : "Quiz"}>
                {e.status === "failed" && <p className="mb-1 text-sm text-danger">Your last score was {e.score}%. You need {c.pass_mark}%. {attemptsLeft(c.max_attempts, e.attempts)} attempt{attemptsLeft(c.max_attempts, e.attempts) === 1 ? "" : "s"} left.</p>}
                {attemptsLeft(c.max_attempts, e.attempts) === 0 ? <p className="text-sm">You've used all your attempts. Ask your manager to reassign the course.</p> : (
                  <form action={takeQuiz} className="space-y-2"><input type="hidden" name="course_id" value={id} />
                    {c.questions.map((q, i) => <fieldset key={i} className="rounded-md border border-line p-1.5"><legend className="px-0.5 text-sm font-medium">{i + 1}. {q.q}</legend>
                      {q.options.map((o, j) => <label key={j} className="flex min-h-touch items-center gap-1 text-sm"><input type="radio" name={`q${i}`} value={j} required />{o}</label>)}</fieldset>)}
                    <SubmitButton pending="Marking…">Submit quiz</SubmitButton></form>)}</Panel>)
          ) : !manage && <p className="text-sm text-muted">This course isn't assigned to you.</p>}
        </div>
        {manage && <div className="space-y-2">
          <Panel title="Assign"><form action={assignCourse} className="space-y-1.5"><input type="hidden" name="course_id" value={id} />
            <fieldset><legend className="sr-only">People</legend><div className="max-h-[14rem] overflow-y-auto">{d.people.map((p) => <label key={p.user_id} className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name="user_ids" value={p.user_id} />{p.name}</label>)}</div></fieldset>
            <SubmitButton pending="Assigning…">Assign course</SubmitButton><p className="text-xs text-muted">Reassigning someone who failed or whose certificate expired restarts their attempts.</p></form></Panel>
          <Panel title="Completion">{d.roster.length === 0 ? <p className="text-sm text-muted">Not assigned yet.</p> : <ul className="divide-y divide-line">{d.roster.map((r, i) => <li key={i} className="flex items-center justify-between py-1 text-sm"><span>{r.who}</span><Status tone={r.status === "passed" ? "ok" : r.status === "failed" ? "danger" : "info"}>{r.status === "assigned" ? "To do" : `${r.status[0]!.toUpperCase()}${r.status.slice(1)}${r.score !== null ? ` ${r.score}%` : ""}`}</Status></li>)}</ul>}</Panel></div>}
      </div>
    </>
  );
}
