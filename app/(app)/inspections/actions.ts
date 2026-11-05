"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { parseItems, scoreInspection, severityOf, type Answer, type TemplateItem } from "@/lib/rules/inspection";

export async function createTemplate(f: FormData) {
  const ctx = await requireCtx();
  return run("/inspections?tab=templates", "/inspections?tab=templates", "Inspection template saved.", async () => {
    const name = str(f, "name"); if (name.length < 2) fail("Name the template.");
    let items: TemplateItem[]; try { items = parseItems(String(f.get("items") ?? "")); } catch (e) { return fail((e as Error).message); }
    if (items.length === 0) fail("Add at least one item.");
    await asUser(ctx.user.id, (db) => db.q("insert into inspection_templates(company_id, name, items) values ($1,$2,$3)", [ctx.companyId, name, JSON.stringify(items)]));
  });
}

export async function scheduleInspection(f: FormData) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), tpl = uuid(f, "template_id"), inspector = uuid(f, "inspector_id"); const date = str(f, "date");
  return run("/inspections/new", "/inspections", "Inspection scheduled.", async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("Choose the inspection date.");
    await asUser(ctx.user.id, async (db) => {
      await db.q("insert into inspections(company_id, branch_id, template_id, inspector_id, scheduled_for) values ($1,$2,$3,$4,$5)", [ctx.companyId, branch, tpl, inspector, date]);
      if (inspector !== ctx.user.id) await db.q("insert into notifications(company_id, user_id, title, body, href) values ($1,$2,$3,$4,$5)", [ctx.companyId, inspector, "Inspection assigned", `Scheduled for ${date}`, "/inspections"]);
    });
  });
}

export async function completeInspection(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/inspections/${id}`, `/inspections/${id}`, "Inspection completed. Findings were raised for each failed item.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const ins = await db.one<{ status: string; inspector_id: string; branch_id: string; items: TemplateItem[] }>("select i.status, i.inspector_id, i.branch_id, t.items from inspections i join inspection_templates t on t.id = i.template_id where i.id = $1 for update of i", [id]);
      if (!ins) fail("That inspection wasn't found."); if (ins!.status !== "scheduled") fail("This inspection was already completed.");
      if (ins!.inspector_id !== ctx.user.id && !ctx.has("approve", "inspections")) fail("Only the assigned inspector can complete it.");
      const answers: Record<string, Answer> = {}; const comments: Record<string, string> = {};
      for (const it of ins!.items) { const a = str(f, `a:${it.id}`) as Answer; if (["pass", "fail", "na"].includes(a)) answers[it.id] = a; comments[it.id] = str(f, `c:${it.id}`); }
      const r = scoreInspection(ins!.items, answers);
      if (r.unanswered.length) fail(`Answer every item. Still open: ${ins!.items.filter((i) => r.unanswered.includes(i.id)).map((i) => i.text).join("; ")}.`);
      const noComment = r.failed.filter((i) => comments[i.id]!.length < 3);
      if (noComment.length) fail(`Say what you found for each failed item: ${noComment.map((i) => i.text).join("; ")}.`);
      await db.q("update inspections set status='completed', completed_at=now(), answers=$2, score=$3, critical_failed=$4 where id=$1", [id, JSON.stringify({ answers, comments }), r.score, r.criticalFailed]);
      for (const it of r.failed) await db.q("insert into findings(company_id, inspection_id, branch_id, item_id, text, severity, comment) values ($1,$2,$3,$4,$5,$6,$7)", [ctx.companyId, id, ins!.branch_id, it.id, it.text, severityOf(it), comments[it.id]]);
    });
  });
}

export async function assignAction(f: FormData) {
  const ctx = await requireCtx(); const finding = uuid(f, "finding_id"), assignee = uuid(f, "assignee_id"); const due = str(f, "due"), desc = str(f, "description");
  return run(`/inspections/findings/${finding}`, `/inspections/findings/${finding}`, "Corrective action assigned.", async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) fail("Set a due date."); if (desc.length < 3) fail("Describe what must be fixed.");
    await asUser(ctx.user.id, async (db) => {
      const fd = await db.one<{ branch_id: string; text: string }>("select branch_id, text from findings where id = $1", [finding]);
      if (!fd) fail("That finding wasn't found.");
      await db.q("insert into corrective_actions(company_id, finding_id, branch_id, assignee_id, due_at, description) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, finding, fd!.branch_id, assignee, due, desc]);
      await db.q("insert into notifications(company_id, user_id, title, body, href) values ($1,$2,$3,$4,$5)", [ctx.companyId, assignee, `Corrective action: ${fd!.text}`, `Due ${due}`, `/inspections/findings/${finding}`]);
    });
  });
}

export async function completeAction(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), finding = uuid(f, "finding_id"); const proof = str(f, "proof");
  return run(`/inspections/findings/${finding}`, `/inspections/findings/${finding}`, "Marked fixed. It now waits for independent verification.", async () => {
    if (proof.length < 3) fail("Describe what you did and where the proof is. Attach photos to the action below if you can.");
    const n = await asUser(ctx.user.id, (db) => db.q("update corrective_actions set status = 'done', proof_note = $2 where id = $1 and status = 'open' and assignee_id = $3 returning id", [id, proof, ctx.user.id]));
    if (n.length === 0) fail("Only the person it's assigned to can mark it fixed.");
  });
}

async function verify(f: FormData, accept: boolean) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), finding = uuid(f, "finding_id"); const note = str(f, "note");
  return run(`/inspections/findings/${finding}`, `/inspections/findings/${finding}`, accept ? "Verified. The finding is closed." : "Sent back. The finding is reopened.", async () => {
    if (!ctx.has("approve", "inspections")) fail("You don't have permission to verify corrections.");
    if (!accept && note.length < 3) fail("Say what is still wrong so it can be fixed.");
    await asUser(ctx.user.id, async (db) => {
      const a = await db.one<{ assignee_id: string; status: string }>("select assignee_id, status from corrective_actions where id = $1", [id]);
      if (!a) fail("That action wasn't found."); if (a!.status !== "done") fail("It isn't waiting for verification.");
      if (a!.assignee_id === ctx.user.id) fail("Someone other than the person who did the work must verify it.");
      if (accept) await db.q("update corrective_actions set status = 'verified', verify_note = $2 where id = $1", [id, note || null]);
      else await db.q("update corrective_actions set status = 'open', verify_note = $2 where id = $1", [id, note]);
    });
  });
}

export async function verifyAccept(f: FormData) { return verify(f, true); }
export async function verifyReject(f: FormData) { return verify(f, false); }
