"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { zonedToIso } from "@/lib/format";

const opt = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : v; };

export async function createTask(f: FormData) {
  const ctx = await requireCtx();
  return run("/tasks/new", "/tasks", "Task created.", async () => {
    const title = str(f, "title"); if (title.length < 2) fail("Give the task a title.");
    const branch = opt(f, "branch_id"), assignee = opt(f, "assignee_id"), due = opt(f, "due");
    const priority = ["low", "normal", "high", "urgent"].includes(str(f, "priority")) ? str(f, "priority") : "normal";
    await asUser(ctx.user.id, async (db) => {
      // Deadlines are entered in the branch's time zone.
      const tz = branch ? (await db.one<{ timezone: string }>("select timezone from branches where id = $1", [branch]))?.timezone ?? ctx.company.timezone : ctx.company.timezone;
      const id = (await db.one<{ id: string }>("insert into tasks(company_id, branch_id, title, description, assignee_id, created_by, priority, due_at, requires_evidence) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
        [ctx.companyId, branch, title, str(f, "description"), assignee, ctx.user.id, priority, due ? zonedToIso(due, tz) : null, f.get("requires_evidence") === "on"]))!.id;
      if (assignee && assignee !== ctx.user.id) await db.q("insert into notifications(company_id, user_id, title, body, href) values ($1,$2,$3,$4,$5)", [ctx.companyId, assignee, `New task: ${title}`, due ? `Due ${due.replace("T", " ")} (${tz})` : "", `/tasks/${id}`]);
    });
  });
}

export async function setTaskStatus(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const to = str(f, "to");
  return run(`/tasks/${id}`, `/tasks/${id}`, to === "done" ? "Task completed." : "Task updated.", async () => {
    if (!["open", "in_progress", "blocked", "done", "cancelled"].includes(to)) fail("Unknown status.");
    const note = str(f, "evidence_note");
    const n = await asUser(ctx.user.id, (db) => db.q("update tasks set status = $2, evidence_note = coalesce(nullif($3,''), evidence_note) where id = $1 returning id", [id, to, note]));
    if (n.length === 0) fail("You can't update that task.");
  });
}

export async function addTaskComment(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/tasks/${id}`, `/tasks/${id}`, "Comment added.", async () => {
    const body = str(f, "body"); if (!body) fail("Write a comment first.");
    await asUser(ctx.user.id, (db) => db.q("insert into task_comments(company_id, task_id, author_id, body) values ($1,$2,$3,$4)", [ctx.companyId, id, ctx.user.id, body]));
  });
}
