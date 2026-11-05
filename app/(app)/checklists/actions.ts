"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { missingRequired, type ChecklistItem } from "@/lib/rules/checklist";

async function save(f: FormData, submit: boolean) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), tpl = uuid(f, "template_id");
  const back = `/checklists/${branch}/${tpl}`;
  return run(back, submit ? "/checklists" : back, submit ? "Checklist submitted for review." : "Progress saved.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const t = await db.one<{ items: ChecklistItem[] }>("select items from checklist_templates where id = $1", [tpl]);
      if (!t) fail("That checklist wasn't found.");
      const answers: Record<string, string> = {};
      for (const i of t!.items) { const v = str(f, `a:${i.id}`); if (v) answers[i.id] = v; const n = str(f, `n:${i.id}`); if (n) answers[`${i.id}:note`] = n; }
      if (submit) { const miss = missingRequired(t!.items, answers); if (miss.length) fail(`Complete the required items first: ${miss.map((m) => m.text).join("; ")}.`); }
      const row = await db.one<{ id: string; status: string }>(
        `insert into checklist_runs(company_id, branch_id, template_id, run_date, answers, status)
         select $1, b.id, $3, (now() at time zone b.timezone)::date, $4, 'draft' from branches b where b.id = $2
         on conflict (branch_id, template_id, run_date) do update set answers = excluded.answers
           where checklist_runs.status in ('draft','rejected') returning id, status`, [ctx.companyId, branch, tpl, JSON.stringify(answers)]);
      if (!row) fail("Today's checklist was already submitted and can't be changed.");
      if (submit) await db.q("update checklist_runs set status = 'submitted', submitted_by = $2, submitted_at = now(), review_note = null where id = $1", [row!.id, ctx.user.id]);
    });
  });
}

async function review(f: FormData, approve: boolean) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const note = str(f, "note");
  return run("/checklists?tab=review", "/checklists?tab=review", approve ? "Checklist approved." : "Sent back for correction.", async () => {
    if (!approve && note.length < 3) fail("Say what needs fixing so they can correct and resubmit.");
    const n = await asUser(ctx.user.id, (db) => db.q("update checklist_runs set status = $2, reviewed_by = $3, review_note = $4 where id = $1 and status = 'submitted' returning id", [id, approve ? "approved" : "rejected", ctx.user.id, note || null]));
    if (n.length === 0) fail("That checklist isn't waiting for review.");
  });
}

// One server action per button (formAction): the button pressed decides what runs.
export async function saveRunDraft(f: FormData) { return save(f, false); }
export async function submitRun(f: FormData) { return save(f, true); }
export async function approveRun(f: FormData) { return review(f, true); }
export async function rejectRun(f: FormData) { return review(f, false); }
