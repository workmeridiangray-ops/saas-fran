/**
 * Permission engine (brief §2). Roles are configurable bundles of grants;
 * access also depends on scope (company/brand/region/branch/department),
 * record ownership and approval authority. Pure: no DB, no clock.
 * The same model is enforced in Postgres RLS (supabase/migrations).
 */
export const ACTIONS = [
  "view", "create", "edit", "approve", "reject", "assign", "export",
  "archive", "pay", "refund", "configure", "sensitive",
] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCES = [
  "organisation", "branches", "franchise", "projects", "tasks", "approvals",
  "documents", "inspections", "training", "people", "purchasing", "inventory",
  "sales", "royalties", "marketing", "tickets", "assets", "reports",
  "studio", "integrations", "billing", "users", "actions",
] as const;
export type Resource = (typeof RESOURCES)[number];

export interface Grant {
  resource: Resource | "*";
  actions: Action[] | "*";
  /** Only records the user owns. */
  ownOnly?: boolean;
}
export interface Role { id: string; name: string; grants: Grant[] }

/** Empty/undefined dimension = unrestricted on that dimension. */
export interface Scope {
  brandIds?: string[];
  regionIds?: string[];
  branchIds?: string[];
  departmentIds?: string[];
}
export interface Membership {
  userId: string;
  companyId: string;
  status: "active" | "suspended" | "invited";
  roles: Role[];
  scope: Scope;
  /** Highest single amount (minor units) this person may approve. undefined = none set. */
  approvalLimitMinor?: number;
}
export interface Target {
  companyId: string;
  brandId?: string;
  regionId?: string;
  branchId?: string;
  departmentId?: string;
  ownerId?: string;
}

const DIMENSIONS = [
  ["brandIds", "brandId"], ["regionIds", "regionId"],
  ["branchIds", "branchId"], ["departmentIds", "departmentId"],
] as const;

export function inScope(scope: Scope, target: Target): boolean {
  for (const [scopeKey, targetKey] of DIMENSIONS) {
    const allowed = scope[scopeKey];
    if (!allowed || allowed.length === 0) continue;
    const value = target[targetKey];
    // A scoped person cannot reach records that carry no value on that dimension.
    if (value === undefined || !allowed.includes(value)) return false;
  }
  return true;
}

function grantAllows(g: Grant, action: Action, resource: Resource, isOwner: boolean): boolean {
  if (g.resource !== "*" && g.resource !== resource) return false;
  if (g.actions !== "*" && !g.actions.includes(action)) return false;
  return !g.ownOnly || isOwner;
}

export function can(m: Membership, action: Action, resource: Resource, target: Target): boolean {
  if (m.status !== "active") return false;
  if (m.companyId !== target.companyId) return false; // tenant wall, always first
  if (!inScope(m.scope, target)) return false;
  const isOwner = target.ownerId !== undefined && target.ownerId === m.userId;
  return m.roles.some((r) => r.grants.some((g) => grantAllows(g, action, resource, isOwner)));
}

export type ApprovalDecision =
  | { ok: true }
  | { ok: false; reason: "no_permission" | "no_limit_set" | "over_limit" | "own_request" };

/** Approving needs the permission, a limit covering the amount, and a different requester. */
export function canApprove(
  m: Membership, resource: Resource, target: Target, amountMinor: number, requesterId: string,
): ApprovalDecision {
  if (!can(m, "approve", resource, target)) return { ok: false, reason: "no_permission" };
  if (requesterId === m.userId) return { ok: false, reason: "own_request" };
  if (amountMinor > 0) {
    if (m.approvalLimitMinor === undefined) return { ok: false, reason: "no_limit_set" };
    if (amountMinor > m.approvalLimitMinor) return { ok: false, reason: "over_limit" };
  }
  return { ok: true };
}

/** Which navigation modules a membership may see (subscription gating is applied separately). */
export function visibleResources(m: Membership): Resource[] {
  if (m.status !== "active") return [];
  return RESOURCES.filter((res) =>
    m.roles.some((r) => r.grants.some((g) => grantAllows(g, "view", res, true))));
}

/** Sensitive fields are hidden unless the dedicated action is granted. */
export function redact<T extends Record<string, unknown>>(
  m: Membership, target: Target, resource: Resource, row: T, sensitiveKeys: (keyof T)[],
): Partial<T> {
  if (can(m, "sensitive", resource, target)) return row;
  const copy: Partial<T> = { ...row };
  for (const k of sensitiveKeys) delete copy[k];
  return copy;
}

/** Starter bundles; companies copy and edit these. */
export const STARTER_ROLES: Role[] = [
  { id: "owner", name: "Company owner", grants: [{ resource: "*", actions: "*" }] },
  {
    id: "branch_manager", name: "Branch manager",
    grants: [
      { resource: "branches", actions: ["view", "edit"] },
      { resource: "tasks", actions: ["view", "create", "edit", "assign"] },
      { resource: "approvals", actions: ["view", "approve", "reject"] },
      { resource: "purchasing", actions: ["view", "create", "approve"] },
      { resource: "inventory", actions: ["view", "create", "edit"] },
      { resource: "inspections", actions: ["view"] },
      { resource: "training", actions: ["view"] },
      { resource: "tickets", actions: ["view", "create", "edit"] },
      { resource: "reports", actions: ["view", "export"] },
    ],
  },
  {
    id: "inspector", name: "Auditor / inspector",
    grants: [
      { resource: "inspections", actions: ["view", "create", "edit"] },
      { resource: "tasks", actions: ["view", "create"] },
    ],
  },
  {
    id: "employee", name: "Employee",
    grants: [
      { resource: "tasks", actions: ["view", "edit"], ownOnly: true },
      { resource: "training", actions: ["view"] },
      { resource: "documents", actions: ["view"] },
    ],
  },
];
