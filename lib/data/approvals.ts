import type { Db } from "@/lib/db";
import { routeApproval, type ApprovalRule } from "@/lib/rules/approval";
import { UserError } from "@/lib/flash";

interface RuleRow { id: string; name: string; kind: string; priority: number; min_amount_minor: string | null; max_amount_minor: string | null; steps: { role_id: string; label: string }[] }

/** Pick the company's rule for this request and open an approval request with a snapshot of its steps. */
export async function submitForApproval(db: Db, a: { companyId: string; userId: string; kind: string; subjectId: string; title: string; amountMinor: number; branchId: string | null }) {
  const rows = await db.q<RuleRow>("select id, name, kind, priority, min_amount_minor, max_amount_minor, steps from approval_rules where company_id = $1", [a.companyId]);
  const rules: ApprovalRule[] = rows.map((r) => ({
    id: r.id, priority: r.priority,
    when: { kind: r.kind, ...(r.min_amount_minor !== null && { minAmountMinor: Number(r.min_amount_minor) }), ...(r.max_amount_minor !== null && { maxAmountMinor: Number(r.max_amount_minor) }) },
    steps: r.steps.map((s) => ({ roleId: s.role_id, reasonRequiredOnReject: true as const })),
  }));
  let chosen: ApprovalRule;
  try { chosen = routeApproval(rules, { kind: a.kind, amountMinor: a.amountMinor }); }
  catch { throw new UserError(`No approval rule covers a ${a.kind} of this size. Add one under Approvals → Rules, then submit again.`); }
  const steps = rows.find((r) => r.id === chosen.id)!.steps;
  const req = (await db.one<{ id: string }>(
    "insert into approval_requests(company_id, branch_id, kind, subject_id, title, amount_minor, requester_id, steps) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [a.companyId, a.branchId, a.kind, a.subjectId, a.title, a.amountMinor, a.userId, JSON.stringify(steps)]))!.id;
  // Tell the people who can decide step 1.
  await db.q(
    `insert into notifications(company_id, user_id, title, body, href)
     select $1, m.user_id, $2, $3, $4 from memberships m join membership_roles mr on mr.membership_id = m.id
      where m.company_id = $1 and m.status = 'active' and mr.role_id = $5 and m.user_id <> $6`,
    [a.companyId, `Approval needed: ${a.title}`, "", `/approvals?open=${req}`, steps[0]?.role_id ?? null, a.userId]);
  return req;
}
