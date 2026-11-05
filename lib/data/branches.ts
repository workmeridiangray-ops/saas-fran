import type { Db } from "@/lib/db";
import type { BranchSnapshot } from "@/lib/rules/branch-closure";

/** Real counts for the closure review. Stock and integrations aren't tracked by this release, so they are 0. */
export async function loadClosureSnapshot(db: Db, companyId: string, branchId: string): Promise<BranchSnapshot> {
  const n = async (sql: string) => Number((await db.one<{ n: string }>(sql, [companyId, branchId]))!.n);
  // Only people limited to this branch are affected. Someone scoped to several branches keeps the others.
  const users = await db.q<{ user_id: string; name: string; others: boolean }>(
    `select m.user_id, coalesce(p.display_name, p.email, 'Unknown') as name, cardinality(m.branch_ids) > 1 as others
       from memberships m left join profiles p on p.id = m.user_id
      where m.company_id = $1 and m.status = 'active' and $2::uuid = any(m.branch_ids)`, [companyId, branchId]);
  return {
    pendingOrders: await n("select count(*) n from purchase_orders where company_id=$1 and branch_id=$2 and status in ('sent','partially_received')"),
    stockUnitsOnHand: 0,
    openDuesMinor: Number((await db.one<{ n: string }>(
      `select coalesce(sum(app.statement_outstanding(s.id)),0) n from statements s where s.company_id=$1 and s.branch_id=$2 and s.status='issued'`, [companyId, branchId]))!.n),
    assetsAssigned: await n("select count(*) n from assets where company_id=$1 and branch_id=$2 and status <> 'disposed'"),
    activeIntegrations: 0,
    openTasks: await n("select count(*) n from tasks where company_id=$1 and branch_id=$2 and status in ('open','in_progress','blocked')"),
    activeUsers: users.map((u) => ({ id: u.user_id, name: u.name, alsoAssignedElsewhere: u.others })),
  };
}
