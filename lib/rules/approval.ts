/**
 * Approval routing (brief §11). Rules may depend on request kind, amount,
 * branch, department and severity. Most specific rule wins; ties go to the
 * higher priority; no match is an explicit error, never a silent auto-approve.
 */
export interface ApprovalRequest {
  kind: string;
  amountMinor?: number;
  branchId?: string;
  departmentId?: string;
  severity?: "low" | "medium" | "high" | "critical";
}
export interface ApprovalRule {
  id: string;
  priority: number;
  when: {
    kind?: string;
    minAmountMinor?: number;
    maxAmountMinor?: number;
    branchIds?: string[];
    departmentIds?: string[];
    severities?: NonNullable<ApprovalRequest["severity"]>[];
  };
  /** Ordered steps; each needs one approver holding the role. */
  steps: { roleId: string; reasonRequiredOnReject: true }[];
}

function matches(rule: ApprovalRule, r: ApprovalRequest): boolean {
  const w = rule.when;
  if (w.kind !== undefined && w.kind !== r.kind) return false;
  const amount = r.amountMinor ?? 0;
  if (w.minAmountMinor !== undefined && amount < w.minAmountMinor) return false;
  if (w.maxAmountMinor !== undefined && amount > w.maxAmountMinor) return false;
  if (w.branchIds && (!r.branchId || !w.branchIds.includes(r.branchId))) return false;
  if (w.departmentIds && (!r.departmentId || !w.departmentIds.includes(r.departmentId))) return false;
  if (w.severities && (!r.severity || !w.severities.includes(r.severity))) return false;
  return true;
}
const specificity = (rule: ApprovalRule) => Object.values(rule.when).filter((v) => v !== undefined).length;

export function routeApproval(rules: ApprovalRule[], request: ApprovalRequest): ApprovalRule {
  const hits = rules.filter((r) => matches(r, request));
  if (hits.length === 0) throw new Error(`No approval rule covers a "${request.kind}" request; configure one before submitting`);
  hits.sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority || a.id.localeCompare(b.id));
  return hits[0]!;
}

export interface Decision { step: number; by: string; outcome: "approved" | "rejected"; reason?: string }

/** Rejections and overrides must carry a reason for the audit trail. */
export function validateDecision(d: Decision): string | null {
  if (d.outcome === "rejected" && !(d.reason && d.reason.trim().length >= 3)) {
    return "Give a reason for rejecting so the requester knows what to fix";
  }
  return null;
}
export function progress(rule: ApprovalRule, decisions: Decision[]): "pending" | "approved" | "rejected" {
  if (decisions.some((d) => d.outcome === "rejected")) return "rejected";
  const approvedSteps = new Set(decisions.filter((d) => d.outcome === "approved").map((d) => d.step));
  return rule.steps.every((_, i) => approvedSteps.has(i)) ? "approved" : "pending";
}
