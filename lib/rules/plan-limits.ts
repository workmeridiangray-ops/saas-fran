/**
 * Plan changes (brief §6, §25). Rules:
 *  - a downgrade never deletes data;
 *  - going over a limit blocks *new* records, existing ones stay readable/exportable;
 *  - a module the new plan drops stays read-only while paid work is unresolved;
 *  - historical invoices are never rewritten (a change only affects the next period).
 */
export type LimitKey = "branches" | "users" | "storageMb";
export interface PlanDef {
  id: string;
  version: number;
  /** null = unlimited */
  limits: Record<LimitKey, number | null>;
  modules: string[];
}
export interface Usage {
  branches: number;
  users: number;
  storageMb: number;
  /** Unresolved work per module id, e.g. open POs, unverified findings. */
  openWorkByModule: Record<string, number>;
  enabledModules: string[];
}

export interface Violation { resource: LimitKey; used: number; limit: number; over: number }
export type ModuleOutcome = "keep" | "read_only_until_resolved" | "locked_data_retained";

export interface PlanChangeEvaluation {
  /** The change may be confirmed. Over-limit is allowed with a plan, never with deletion. */
  confirmable: boolean;
  violations: Violation[];
  /** User must choose what stays active (e.g. which branches) before new records are allowed. */
  requiresChoice: boolean;
  modules: { id: string; outcome: ModuleOutcome; openWork: number }[];
  /** Always false: nothing is deleted by a plan change. */
  deletesData: false;
  messages: string[];
}

export function evaluatePlanChange(target: PlanDef, usage: Usage): PlanChangeEvaluation {
  const violations: Violation[] = [];
  for (const key of ["branches", "users", "storageMb"] as LimitKey[]) {
    const limit = target.limits[key];
    if (limit !== null && usage[key] > limit) {
      violations.push({ resource: key, used: usage[key], limit, over: usage[key] - limit });
    }
  }

  const modules = usage.enabledModules.map((id) => {
    const openWork = usage.openWorkByModule[id] ?? 0;
    const outcome: ModuleOutcome = target.modules.includes(id)
      ? "keep"
      : openWork > 0 ? "read_only_until_resolved" : "locked_data_retained";
    return { id, outcome, openWork };
  });

  const messages: string[] = [];
  for (const v of violations) {
    messages.push(
      `You have ${v.used.toLocaleString("en")} ${label(v.resource)} and this plan includes ${v.limit.toLocaleString("en")}. ` +
      `Nothing will be deleted; you won't be able to add more until you are within ${v.limit.toLocaleString("en")}.`);
  }
  for (const m of modules) {
    if (m.outcome === "read_only_until_resolved") {
      messages.push(`${m.id}: ${m.openWork} unresolved item(s) stay open and editable to finish, but no new work can be started.`);
    } else if (m.outcome === "locked_data_retained") {
      messages.push(`${m.id}: turned off. Existing data is kept and can be exported.`);
    }
  }

  return {
    confirmable: true,
    violations,
    requiresChoice: violations.length > 0,
    modules,
    deletesData: false,
    messages,
  };
}

/** Whether a new record may be created given current counts. */
export function canCreate(plan: PlanDef, usage: Pick<Usage, LimitKey>, key: LimitKey): boolean {
  const limit = plan.limits[key];
  return limit === null || usage[key] < limit;
}

function label(k: LimitKey): string {
  return k === "storageMb" ? "MB of storage" : k;
}
