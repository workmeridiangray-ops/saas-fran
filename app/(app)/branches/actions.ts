"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { canMoveBranch, type BranchStatus } from "@/lib/rules/branch-lifecycle";
import { canClose, closureChecklist } from "@/lib/rules/branch-closure";
import { loadClosureSnapshot } from "@/lib/data/branches";
import { loadFields } from "@/lib/studio";
import { parseCustom } from "@/lib/rules/studio";

const opt = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : v; };

export async function createBranch(f: FormData) {
  const ctx = await requireCtx();
  return run("/branches/new", "/branches", "Branch added.", async () => {
    const name = str(f, "name"), code = str(f, "code").toUpperCase();
    if (name.length < 2) fail("Enter the branch name.");
    if (!/^[A-Z0-9-]{2,12}$/.test(code)) fail("Use 2 to 12 letters, numbers or dashes for the branch code, for example DT1.");
    const ownership = str(f, "ownership") === "franchise" ? "franchise" : "company";
    const partner = ownership === "franchise" ? opt(f, "partner_id") : null;
    if (ownership === "franchise" && !partner) fail("Choose the franchise partner who operates this branch.");
    const id = await asUser(ctx.user.id, async (db) => {
      const cf = parseCustom(await loadFields(db, ctx.companyId, "branches"), (n) => f.get(n) as string | null); if (cf.error) fail(cf.error);
      return (await db.one<{ id: string }>(
      `insert into branches(company_id, name, code, brand_id, region_id, legal_entity_id, ownership, partner_id, timezone, status, address, custom)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [ctx.companyId, name, code, opt(f, "brand_id"), opt(f, "region_id"), opt(f, "legal_entity_id"), ownership, partner, str(f, "timezone") || ctx.company.timezone,
       str(f, "status") === "opening" ? "opening" : "active", JSON.stringify({ line1: str(f, "address"), phone: str(f, "phone") }), JSON.stringify(cf.values)]))!.id; });
    return `/branches/${id}`;
  });
}

export async function updateBranch(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/branches/${id}`, `/branches/${id}`, "Branch details saved.", async () => {
    const name = str(f, "name"); if (name.length < 2) fail("Enter the branch name.");
    await asUser(ctx.user.id, async (db) => {
      const cf = parseCustom(await loadFields(db, ctx.companyId, "branches"), (n) => f.get(n) as string | null); if (cf.error) fail(cf.error);
      await db.q(
      `update branches set name=$2, brand_id=$3, region_id=$4, legal_entity_id=$5, timezone=$6, address=$7, custom=$8 where id=$1`,
      [id, name, opt(f, "brand_id"), opt(f, "region_id"), opt(f, "legal_entity_id"), str(f, "timezone") || ctx.company.timezone, JSON.stringify({ line1: str(f, "address"), phone: str(f, "phone") }), JSON.stringify(cf.values)]);
    });
  });
}

export async function moveBranch(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const to = str(f, "to") as BranchStatus;
  return run(`/branches/${id}`, `/branches/${id}`, `Branch is now ${to}.`, async () => {
    await asUser(ctx.user.id, async (db) => {
      const cur = await db.one<{ status: BranchStatus }>("select status from branches where id = $1 for update", [id]);
      if (!cur) fail("That branch wasn't found.");
      if (!canMoveBranch(cur!.status, to)) fail(`A ${cur!.status} branch can't become ${to}.`);
      if (to === "closed") fail("Closing needs the outstanding-work review. Use “Review and close”.");
      await db.q("update branches set status = $2 where id = $1", [id, to]);
    });
  });
}

export async function closeBranch(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const confirmName = str(f, "confirm");
  return run(`/branches/${id}/close`, "/branches", "Branch closed and access removed.", async () => {
    if (!ctx.has("archive", "branches")) fail("You don't have permission to close branches.");
    await asUser(ctx.user.id, async (db) => {
      const b = await db.one<{ name: string; status: BranchStatus }>("select name, status from branches where id = $1 for update", [id]);
      if (!b) fail("That branch wasn't found.");
      if (!canMoveBranch(b!.status, "closing") && b!.status !== "closing") fail(`A ${b!.status} branch can't be closed.`);
      if (confirmName !== b!.name) fail("Type the branch name exactly to confirm.");
      const snap = await loadClosureSnapshot(db, ctx.companyId, id);
      const items = closureChecklist(snap);
      if (!canClose(items)) fail("There is still outstanding work. Resolve it, then close the branch.");
      // The database repeats these checks and removes access last, in one transaction.
      await db.q("select public.close_branch($1)", [id]);
    });
  });
}
