import { redirect } from "next/navigation";
import { asService, asUser } from "@/lib/db";
import { activeWorkspaceId, requireUser, setWorkspace, type SessionUser } from "@/lib/auth/session";
import { can as canRule, type Action, type Grant, type Membership, type Resource, type Target } from "@/lib/rules/permissions";

export interface Ctx {
  user: SessionUser;
  companyId: string;
  company: { name: string; status: string; currency: string; timezone: string; operatingModel: string; industry: string };
  membership: Membership;
  roleNames: string[];
  modules: string[];
  planId: string | null;
  unread: number;
  isPlatformStaff: boolean;
  /** Role grants say yes (ignores record scope; the database enforces scope per row). Use for showing buttons and nav. */
  has(action: Action, resource: Resource): boolean;
  /** Full check for one specific record. */
  can(action: Action, resource: Resource, target?: Partial<Target>): boolean;
}

interface Row {
  company_id: string; name: string; status: string; currency: string; timezone: string; operating_model: string; industry: string;
  brand_ids: string[]; region_ids: string[]; branch_ids: string[]; department_ids: string[]; approval_limit_minor: string | null;
  grants: Grant[][]; role_names: string[]; role_ids: string[]; modules: string[] | null; plan_id: string | null;
}

const SQL = `
  select m.company_id, c.name, c.status, c.currency, c.timezone, c.operating_model, c.industry,
         m.brand_ids, m.region_ids, m.branch_ids, m.department_ids, m.approval_limit_minor,
         coalesce(array_agg(r.grants) filter (where r.id is not null), '{}') as grants,
         coalesce(array_agg(r.name) filter (where r.id is not null), '{}') as role_names,
         coalesce(array_agg(r.id) filter (where r.id is not null), '{}') as role_ids,
         pv.modules, pv.plan_id
    from memberships m
    join companies c on c.id = m.company_id
    left join membership_roles mr on mr.membership_id = m.id
    left join roles r on r.id = mr.role_id
    left join lateral (select * from app.current_plan(c.id)) pv on true
   where m.user_id = $1 and m.status = 'active' and c.status <> 'closed'
   group by m.company_id, c.id, m.id, pv.modules, pv.plan_id
   order by c.name`;

export async function myWorkspaces(userId: string) {
  return asUser(userId, (db) => db.q<Row>(SQL, [userId]));
}

export async function requireCtx(): Promise<Ctx> {
  const user = await requireUser();
  const rows = await myWorkspaces(user.id);
  if (rows.length === 0) redirect("/onboarding");
  const wanted = await activeWorkspaceId();
  let row = rows.find((r) => r.company_id === wanted);
  if (!row) {
    if (rows.length === 1) row = rows[0]!;
    else redirect("/workspaces");
  }
  const unread = await asUser(user.id, async (db) => Number((await db.one<{ n: string }>("select count(*) n from notifications where user_id = $1 and read_at is null and company_id = $2", [user.id, row!.company_id]))!.n));
  const staff = await asService((db) => db.one("select 1 from platform_staff where user_id = $1", [user.id]));
  const grants = row.grants.flat();
  const membership: Membership = {
    userId: user.id, companyId: row.company_id, status: "active",
    roles: [{ id: "merged", name: row.role_names.join(", "), grants }],
    scope: { brandIds: row.brand_ids, regionIds: row.region_ids, branchIds: row.branch_ids, departmentIds: row.department_ids },
    approvalLimitMinor: row.approval_limit_minor === null ? undefined : Number(row.approval_limit_minor),
  };
  const unscoped: Membership = { ...membership, scope: {} };
  return {
    user, companyId: row.company_id,
    company: { name: row.name, status: row.status, currency: row.currency, timezone: row.timezone, operatingModel: row.operating_model, industry: row.industry },
    membership, roleNames: row.role_names, modules: row.modules ?? [], planId: row.plan_id, unread, isPlatformStaff: !!staff,
    has: (a, r) => row!.status !== "suspended" || a === "view" || r === "billing" ? canRule(unscoped, a, r, { companyId: row!.company_id, ownerId: user.id }) : false,
    can: (a, r, t = {}) => canRule(membership, a, r, { companyId: row!.company_id, ...t }),
  };
}
export { setWorkspace };
