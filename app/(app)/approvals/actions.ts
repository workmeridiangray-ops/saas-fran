"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";

async function decide(f: FormData, outcome: "approved" | "rejected") {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const reason = str(f, "reason");
  const back = `/approvals?open=${id}`;
  return run(back, back, outcome === "approved" ? "Decision recorded: approved." : "Decision recorded: rejected.", async () => {
    if (outcome === "rejected" && reason.length < 3) fail("Give a reason for rejecting so the requester knows what to fix.");
    await asUser(ctx.user.id, async (db) => {
      const r = await db.one<{ current_step: number; status: string }>("select current_step, status from approval_requests where id = $1", [id]);
      if (!r) fail("That request wasn't found."); if (r!.status !== "pending") fail("That request has already been decided.");
      // The database re-checks everything: who you are, your step, your limit, and that it isn't your own request.
      await db.q("insert into approval_decisions(company_id, request_id, step, decided_by, outcome, reason) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, id, r!.current_step, ctx.user.id, outcome, reason || null]);
    });
  });
}

/** Each button is bound to its own action (formAction), so what you press is exactly what runs. */
export async function approveRequest(f: FormData) { return decide(f, "approved"); }
export async function rejectRequest(f: FormData) { return decide(f, "rejected"); }

export async function cancelRequest(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/approvals?open=${id}`, "/approvals", "Request withdrawn.", async () => {
    const n = await asUser(ctx.user.id, async (db) => {
      const r = await db.q<{ kind: string; subject_id: string }>("update approval_requests set status = 'cancelled' where id = $1 and status = 'pending' returning kind, subject_id", [id]);
      if (r[0]?.kind === "purchase") await db.q("update requisitions set status = 'draft' where id = $1 and status = 'submitted'", [r[0].subject_id]);
      return r.length;
    });
    if (n === 0) fail("Only the requester can withdraw a pending request.");
  });
}

export async function saveRule(f: FormData) {
  const ctx = await requireCtx();
  return run("/approvals?tab=rules", "/approvals?tab=rules", "Approval rule saved.", async () => {
    const name = str(f, "name"), kind = str(f, "kind");
    if (name.length < 2) fail("Name the rule.");
    const steps = [1, 2, 3].map((i) => str(f, `step${i}`)).filter(Boolean);
    if (steps.length === 0) fail("Choose at least one approver role.");
    const min = str(f, "min"), max = str(f, "max");
    const toMinor = (v: string) => (v === "" ? null : Math.round(Number(v) * 100));
    if ((min && !(Number(min) >= 0)) || (max && !(Number(max) >= 0))) fail("Amounts must be positive numbers.");
    await asUser(ctx.user.id, async (db) => {
      const roles = await db.q<{ id: string; name: string }>("select id, name from roles where company_id = $1 and id = any($2::uuid[])", [ctx.companyId, steps]);
      const json = steps.map((id) => ({ role_id: id, label: roles.find((r) => r.id === id)?.name ?? "Approver" }));
      await db.q("insert into approval_rules(company_id, name, kind, priority, min_amount_minor, max_amount_minor, steps) values ($1,$2,$3,$4,$5,$6,$7)",
        [ctx.companyId, name, kind, Number(str(f, "priority")) || 1, toMinor(min), toMinor(max), JSON.stringify(json)]);
    });
  });
}
export async function deleteRule(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/approvals?tab=rules", "/approvals?tab=rules", "Rule removed. Requests already submitted keep the steps they were submitted with.", async () => {
    await asUser(ctx.user.id, (db) => db.q("delete from approval_rules where id = $1", [id]));
  });
}
