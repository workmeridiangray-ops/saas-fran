"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { templateFor } from "@/lib/templates/opening";
import { parseMinor } from "@/lib/rules/money";

const CATS = ["site", "fitout", "equipment", "recruitment", "licences", "training", "other"];
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function createProject(f: FormData) {
  const ctx = await requireCtx(); const branch = str(f, "branch_id") || null; const industry = str(f, "industry") || "general";
  return run("/projects/new", "/projects", "Project created from the template.", async () => {
    const name = str(f, "name"); if (name.length < 3) fail("Name the project.");
    let budget = 0; if (str(f, "budget")) { const b = parseMinor(str(f, "budget")); if (!b.ok) fail(`Budget: ${b.error}`); else budget = b.value; }
    const id = await asUser(ctx.user.id, async (db) => {
      const pid = (await db.one<{ id: string }>("insert into projects(company_id, branch_id, name, industry, target_launch, budget_minor, owner_id) values ($1,$2,$3,$4,$5,$6,$7) returning id", [ctx.companyId, branch, name, industry, date(str(f, "target")), budget, ctx.user.id]))!.id;
      for (const it of templateFor(industry).items) await db.q("insert into project_items(company_id, project_id, category, title, required, requires_evidence) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, pid, it.category, it.title, it.required, !!it.evidence]);
      if (branch) await db.q("update branches set status = 'opening' where id = $1 and status = 'planned'", [branch]);
      return pid;
    });
    return `/projects/${id}`;
  });
}
export async function updateItem(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), project = uuid(f, "project_id"); const status = str(f, "status");
  return run(`/projects/${project}`, `/projects/${project}`, "Item updated.", async () => {
    if (!["todo", "doing", "done", "blocked"].includes(status)) fail("Unknown status.");
    let cost = 0; if (str(f, "cost")) { const c = parseMinor(str(f, "cost")); if (!c.ok) fail(`Cost: ${c.error}`); else cost = c.value; }
    await asUser(ctx.user.id, (db) => db.q("update project_items set status = $2, assignee_id = nullif($3,'')::uuid, due_on = $4, cost_minor = $5, blocker_note = nullif($6,''), evidence_note = nullif($7,'') where id = $1",
      [id, status, str(f, "assignee_id"), date(str(f, "due")), cost, status === "blocked" ? str(f, "note") : "", str(f, "evidence")]));
  });
}
export async function addItem(f: FormData) {
  const ctx = await requireCtx(); const project = uuid(f, "project_id");
  return run(`/projects/${project}`, `/projects/${project}`, "Item added.", async () => {
    const cat = str(f, "category"); if (!CATS.includes(cat)) fail("Choose a category."); if (str(f, "title").length < 2) fail("Name the item.");
    await asUser(ctx.user.id, (db) => db.q("insert into project_items(company_id, project_id, category, title, required, requires_evidence) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, project, cat, str(f, "title"), f.get("required") === "on", f.get("evidence") === "on"]));
  });
}
export async function launchProject(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/projects/${id}`, `/projects/${id}`, "Launched. The branch is now active.", async () => { await asUser(ctx.user.id, (db) => db.q("select public.launch_project($1)", [id])); });
}
export async function saveReview(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/projects/${id}`, `/projects/${id}`, "Post-launch review saved.", async () => {
    const t = str(f, "review"); if (t.length < 10) fail("Write what went well and what to change next time.");
    const n = await asUser(ctx.user.id, (db) => db.q("update projects set post_launch_review = $2 where id = $1 and status = 'launched' returning id", [id, t]));
    if (n.length === 0) fail("A review can be written once the project has launched.");
  });
}
