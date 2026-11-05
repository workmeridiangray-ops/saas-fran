"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { attemptsLeft, expiryFrom, gradeQuiz, type Question } from "@/lib/rules/training";

/** Quiz format, one question per block, blank line between:  Question? / * correct option / other option */
function parseQuiz(text: string): Question[] {
  return text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((block, i) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean); const q = lines.shift()!; const options = lines.map((l) => l.replace(/^\*\s*/, ""));
    const answer = lines.findIndex((l) => l.startsWith("*"));
    if (options.length < 2 || answer < 0) throw new Error(`Question ${i + 1}: give at least two options and mark the right one with *.`);
    return { q, options, answer };
  });
}
export async function createCourse(f: FormData) {
  const ctx = await requireCtx();
  return run("/training/new", "/training", "Course created.", async () => {
    const title = str(f, "title"); if (title.length < 3) fail("Give the course a title.");
    let questions: Question[]; try { questions = parseQuiz(String(f.get("quiz") ?? "")); } catch (e) { return fail((e as Error).message); }
    const pass = Number(str(f, "pass_mark") || "80"), attempts = Number(str(f, "max_attempts") || "3"), validity = str(f, "validity_days");
    if (!(pass >= 1 && pass <= 100)) fail("The pass mark must be between 1 and 100."); if (!(attempts >= 1)) fail("Allow at least one attempt.");
    await asUser(ctx.user.id, (db) => db.q("insert into courses(company_id, title, description, lesson, pass_mark, max_attempts, validity_days, questions) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [ctx.companyId, title, str(f, "description"), String(f.get("lesson") ?? ""), pass, attempts, validity ? Number(validity) : null, JSON.stringify(questions)]));
  });
}
export async function assignCourse(f: FormData) {
  const ctx = await requireCtx(); const course = uuid(f, "course_id"); const users = f.getAll("user_ids").map(String).filter((u) => /^[0-9a-f-]{36}$/i.test(u));
  return run(`/training/${course}`, `/training/${course}`, `Assigned to ${users.length} ${users.length === 1 ? "person" : "people"}.`, async () => {
    if (users.length === 0) fail("Choose at least one person.");
    await asUser(ctx.user.id, async (db) => {
      for (const u of users) {
        // Retraining: an expired or failed enrolment is reset to assigned; a current pass is left alone.
        await db.q(`insert into enrolments(company_id, course_id, user_id) values ($1,$2,$3)
                    on conflict (course_id, user_id) do update set status = 'assigned', attempts = 0, score = null where enrolments.status <> 'passed' or enrolments.expires_at < now()`, [ctx.companyId, course, u]);
        await db.q("insert into notifications(company_id, user_id, title, body, href) values ($1,$2,'Training assigned','', $3)", [ctx.companyId, u, `/training/${course}`]);
      }
    });
  });
}
export async function takeQuiz(f: FormData) {
  const ctx = await requireCtx(); const course = uuid(f, "course_id");
  return run(`/training/${course}`, `/training/${course}`, "Quiz submitted.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const c = await db.one<{ questions: Question[]; pass_mark: number; max_attempts: number; validity_days: number | null }>("select questions, pass_mark, max_attempts, validity_days from courses where id = $1", [course]);
      const e = await db.one<{ id: string; status: string; attempts: number }>("select id, status, attempts from enrolments where course_id = $1 and user_id = $2 for update", [course, ctx.user.id]);
      if (!c || !e) fail("This course isn't assigned to you.");
      if (e!.status === "passed") fail("You've already passed this course.");
      if (attemptsLeft(c!.max_attempts, e!.attempts) === 0) fail("You've used all your attempts. Ask your manager to reassign the course.");
      const given = c!.questions.map((_, i) => { const v = str(f, `q${i}`); return v === "" ? undefined : Number(v); });
      if (given.some((g) => g === undefined)) fail("Answer every question.");
      const r = gradeQuiz(c!.questions, given, c!.pass_mark); const now = new Date();
      await db.q("update enrolments set attempts = attempts + 1, score = $2, status = $3, completed_at = $4, expires_at = $5 where id = $1",
        [e!.id, r.score, r.passed ? "passed" : "failed", r.passed ? now : null, r.passed ? expiryFrom(now, c!.validity_days) : null]);
    });
  });
}
