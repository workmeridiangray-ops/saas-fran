import { describe, expect, it } from "vitest";
import { applyBasisPoints, parseMinor } from "./money";
import { STARTER_ROLES, can, canApprove, redact, visibleResources, type Membership } from "./permissions";
import { canCreate, evaluatePlanChange, type PlanDef, type Usage } from "./plan-limits";
import { allocatePayment, calculateRoyalty, canTransition, ruleFor, type RoyaltyRule } from "./royalty";
import { progress, routeApproval, validateDecision, type ApprovalRule } from "./approval";
import { accessRemovalPlan, canClose, closureChecklist, type BranchSnapshot } from "./branch-closure";

const role = (id: string) => STARTER_ROLES.find((r) => r.id === id)!;
const member = (over: Partial<Membership> = {}): Membership => ({
  userId: "u1", companyId: "c1", status: "active", roles: [role("branch_manager")],
  scope: { branchIds: ["b1"] }, approvalLimitMinor: 50_000, ...over,
});

describe("money", () => {
  it("parses exact amounts and refuses to round", () => {
    expect(parseMinor("1,250.5")).toEqual({ ok: true, value: 125050 });
    expect(parseMinor("0.001").ok).toBe(false);
    expect(parseMinor("abc").ok).toBe(false);
  });
  it("basis points round half away from zero", () => {
    expect(applyBasisPoints(10_000, 500)).toBe(500);
    expect(applyBasisPoints(1_050, 500)).toBe(53); // 52.5 -> 53
    expect(applyBasisPoints(-1_050, 500)).toBe(-53);
  });
});

describe("permissions", () => {
  it("never crosses the tenant wall", () => {
    expect(can(member(), "view", "branches", { companyId: "c2", branchId: "b1" })).toBe(false);
  });
  it("enforces branch scope", () => {
    expect(can(member(), "view", "branches", { companyId: "c1", branchId: "b1" })).toBe(true);
    expect(can(member(), "view", "branches", { companyId: "c1", branchId: "b2" })).toBe(false);
    // company-level record has no branch: a branch-scoped person cannot reach it
    expect(can(member(), "view", "branches", { companyId: "c1" })).toBe(false);
  });
  it("only grants listed actions", () => {
    expect(can(member(), "edit", "branches", { companyId: "c1", branchId: "b1" })).toBe(true);
    expect(can(member(), "archive", "branches", { companyId: "c1", branchId: "b1" })).toBe(false);
    expect(can(member(), "view", "billing", { companyId: "c1", branchId: "b1" })).toBe(false);
  });
  it("ownOnly grants need ownership", () => {
    const emp = member({ roles: [role("employee")], scope: {} });
    expect(can(emp, "edit", "tasks", { companyId: "c1", ownerId: "u1" })).toBe(true);
    expect(can(emp, "edit", "tasks", { companyId: "c1", ownerId: "u9" })).toBe(false);
  });
  it("suspended members have no access", () => {
    expect(can(member({ status: "suspended" }), "view", "branches", { companyId: "c1", branchId: "b1" })).toBe(false);
    expect(visibleResources(member({ status: "suspended" }))).toEqual([]);
  });
  it("approval needs a limit, enough headroom, and a different requester", () => {
    const t = { companyId: "c1", branchId: "b1" };
    expect(canApprove(member(), "purchasing", t, 40_000, "u2")).toEqual({ ok: true });
    expect(canApprove(member(), "purchasing", t, 60_000, "u2")).toEqual({ ok: false, reason: "over_limit" });
    expect(canApprove(member({ approvalLimitMinor: undefined }), "purchasing", t, 1, "u2")).toEqual({ ok: false, reason: "no_limit_set" });
    expect(canApprove(member(), "purchasing", t, 100, "u1")).toEqual({ ok: false, reason: "own_request" });
  });
  it("redacts sensitive fields without the sensitive action", () => {
    const row = { name: "Ana", salary: 100 };
    const t = { companyId: "c1", branchId: "b1" };
    expect(redact(member(), t, "people", row, ["salary"])).toEqual({ name: "Ana" });
    expect(redact(member({ roles: [role("owner")], scope: {} }), t, "people", row, ["salary"])).toEqual(row);
  });
});

describe("plan change", () => {
  const small: PlanDef = { id: "starter", version: 3, limits: { branches: 3, users: 10, storageMb: 1000 }, modules: ["tasks"] };
  const usage: Usage = {
    branches: 5, users: 8, storageMb: 200,
    openWorkByModule: { purchasing: 2 }, enabledModules: ["tasks", "purchasing", "training"],
  };
  const ev = evaluatePlanChange(small, usage);
  it("reports the over-limit resource and never deletes", () => {
    expect(ev.violations).toEqual([{ resource: "branches", used: 5, limit: 3, over: 2 }]);
    expect(ev.requiresChoice).toBe(true);
    expect(ev.deletesData).toBe(false);
  });
  it("keeps paid unresolved work reachable, retains other data", () => {
    const by = Object.fromEntries(ev.modules.map((m) => [m.id, m.outcome]));
    expect(by).toEqual({ tasks: "keep", purchasing: "read_only_until_resolved", training: "locked_data_retained" });
  });
  it("blocks only new records over the limit", () => {
    expect(canCreate(small, usage, "branches")).toBe(false);
    expect(canCreate(small, usage, "users")).toBe(true);
    expect(canCreate({ ...small, limits: { ...small.limits, users: null } }, usage, "users")).toBe(true);
  });
});

describe("royalty", () => {
  const rules: RoyaltyRule[] = [
    { id: "r1", version: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30", type: "percent", rateBp: 500 },
    { id: "r2", version: 2, effectiveFrom: "2026-07-01", type: "percent_with_minimum", rateBp: 600, minimumMinor: 100_000 },
  ];
  it("picks the rule effective on the date and rejects gaps/overlaps", () => {
    expect(ruleFor(rules, "2026-06-30").id).toBe("r1");
    expect(ruleFor(rules, "2026-07-01").id).toBe("r2");
    expect(() => ruleFor(rules, "2025-12-31")).toThrow(/No royalty rule/);
    expect(() => ruleFor([...rules, { ...rules[0]!, id: "dup" }], "2026-03-01")).toThrow(/overlap/);
  });
  it("applies percentage, exclusions, adjustments and the minimum guarantee", () => {
    const input = { grossSalesMinor: 2_000_000, exclusionsMinor: 100_000, adjustmentsMinor: -50_000 };
    expect(calculateRoyalty(rules[0]!, input)).toMatchObject({ baseMinor: 1_850_000, royaltyMinor: 92_500, minimumApplied: false });
    const low = calculateRoyalty(rules[1]!, { grossSalesMinor: 1_000_000, exclusionsMinor: 0, adjustmentsMinor: 0 });
    expect(low).toMatchObject({ royaltyMinor: 100_000, minimumApplied: true, ruleVersion: 2 });
  });
  it("issued statements are immutable", () => {
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("draft", "issued")).toBe(false);
    expect(canTransition("issued", "draft")).toBe(false);
  });
  it("allocates oldest first and returns any remainder", () => {
    const items = [
      { id: "b", kind: "franchise_royalty" as const, dueDate: "2026-02-01", outstandingMinor: 300 },
      { id: "a", kind: "franchise_royalty" as const, dueDate: "2026-01-01", outstandingMinor: 500 },
    ];
    expect(allocatePayment("franchise_royalty", 600, items)).toEqual({
      allocations: [{ itemId: "a", amountMinor: 500 }, { itemId: "b", amountMinor: 100 }], unallocatedMinor: 0,
    });
    expect(allocatePayment("franchise_royalty", 1000, items).unallocatedMinor).toBe(200);
  });
  it("refuses to mix SaaS and royalty balances", () => {
    const mixed = [{ id: "s", kind: "saas_subscription" as const, dueDate: "2026-01-01", outstandingMinor: 100 }];
    expect(() => allocatePayment("franchise_royalty", 100, mixed)).toThrow(/separate/);
  });
});

describe("approval routing", () => {
  const rules: ApprovalRule[] = [
    { id: "any-po", priority: 1, when: { kind: "purchase" }, steps: [{ roleId: "branch_manager", reasonRequiredOnReject: true }] },
    {
      id: "big-po", priority: 1, when: { kind: "purchase", minAmountMinor: 500_000 },
      steps: [{ roleId: "branch_manager", reasonRequiredOnReject: true }, { roleId: "finance", reasonRequiredOnReject: true }],
    },
  ];
  it("most specific rule wins", () => {
    expect(routeApproval(rules, { kind: "purchase", amountMinor: 1_000 }).id).toBe("any-po");
    expect(routeApproval(rules, { kind: "purchase", amountMinor: 600_000 }).id).toBe("big-po");
  });
  it("no match is an error, not an auto-approval", () => {
    expect(() => routeApproval(rules, { kind: "refund" })).toThrow(/No approval rule/);
  });
  it("rejection needs a reason; progress needs every step", () => {
    expect(validateDecision({ step: 0, by: "u", outcome: "rejected" })).not.toBeNull();
    expect(validateDecision({ step: 0, by: "u", outcome: "rejected", reason: "Quote expired" })).toBeNull();
    const big = rules[1]!;
    expect(progress(big, [{ step: 0, by: "u", outcome: "approved" }])).toBe("pending");
    expect(progress(big, [{ step: 0, by: "u", outcome: "approved" }, { step: 1, by: "v", outcome: "approved" }])).toBe("approved");
    expect(progress(big, [{ step: 0, by: "u", outcome: "rejected", reason: "no" }])).toBe("rejected");
  });
});

describe("branch closure", () => {
  const snap: BranchSnapshot = {
    pendingOrders: 2, stockUnitsOnHand: 40, openDuesMinor: 0, assetsAssigned: 3, activeIntegrations: 1,
    openTasks: 0, activeUsers: [{ id: "u1", name: "Ana", alsoAssignedElsewhere: false }, { id: "u2", name: "Bo", alsoAssignedElsewhere: true }],
  };
  it("blocks while work is outstanding", () => {
    expect(canClose(closureChecklist(snap))).toBe(false);
  });
  it("allows once resolved or explicitly carried over", () => {
    const clear = { ...snap, pendingOrders: 0, stockUnitsOnHand: 0, assetsAssigned: 0, activeIntegrations: 0 };
    expect(canClose(closureChecklist(clear))).toBe(true);
    expect(canClose(closureChecklist(snap, ["orders", "stock", "assets", "integrations"]))).toBe(true);
  });
  it("removes access last, per person", () => {
    expect(accessRemovalPlan(snap)).toEqual([
      { userId: "u1", name: "Ana", action: "deactivate_membership" },
      { userId: "u2", name: "Bo", action: "remove_branch_scope" },
    ]);
  });
});
