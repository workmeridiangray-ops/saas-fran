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

import { scoreInspection, severityOf } from "./inspection";
import { attemptsLeft, expiryFrom, gradeQuiz, isExpired } from "./training";
import { missingRequired } from "./checklist";
import { lineTotalMinor, requisitionTotal } from "./purchase";
import { toCsv } from "../csv";
import { base32Decode, totp, verifyTotp, newSecret } from "../auth/totp";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";

describe("inspection scoring", () => {
  const items = [
    { id: "a", text: "Clean", weight: 2, critical: false },
    { id: "b", text: "Fire safety", weight: 3, critical: true },
    { id: "c", text: "Uniform", weight: 1, critical: false },
  ];
  it("weights pass/fail and ignores N/A", () => {
    expect(scoreInspection(items, { a: "pass", b: "pass", c: "fail" }).score).toBe(83.33);
    expect(scoreInspection(items, { a: "pass", b: "pass", c: "na" }).score).toBe(100);
  });
  it("a critical failure caps the score at 70", () => {
    const r = scoreInspection(items, { a: "pass", b: "fail", c: "pass" });
    expect(r.criticalFailed).toBe(true);
    expect(r.score).toBe(50); // raw 50 is already below the cap
    expect(scoreInspection([{ ...items[1]!, weight: 1 }, { id: "z", text: "x", weight: 9, critical: false }], { b: "fail", z: "pass" }).score).toBe(70);
  });
  it("reports unanswered items and severity", () => {
    expect(scoreInspection(items, { a: "pass" }).unanswered).toEqual(["b", "c"]);
    expect(severityOf(items[1]!)).toBe("critical");
    expect(severityOf({ id: "q", text: "", weight: 3, critical: false })).toBe("major");
  });
});

describe("training", () => {
  const qs = [{ q: "1", options: ["a", "b"], answer: 0 }, { q: "2", options: ["a", "b"], answer: 1 }];
  it("grades against the pass mark", () => {
    expect(gradeQuiz(qs, [0, 1], 80)).toMatchObject({ score: 100, passed: true });
    expect(gradeQuiz(qs, [0, 0], 80)).toMatchObject({ score: 50, passed: false });
    expect(gradeQuiz(qs, [0], 50).passed).toBe(true);
  });
  it("limits attempts and computes expiry", () => {
    expect(attemptsLeft(3, 3)).toBe(0);
    const d = expiryFrom(new Date("2026-01-01T00:00:00Z"), 365)!;
    expect(d.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(isExpired(d, new Date("2027-01-02"))).toBe(true);
    expect(expiryFrom(new Date(), null)).toBeNull();
  });
});

describe("checklist and purchase maths", () => {
  it("required items must be done or N/A", () => {
    const items = [{ id: "1", text: "a", required: true }, { id: "2", text: "b", required: false }, { id: "3", text: "c", required: true }];
    expect(missingRequired(items, { "1": "done" }).map((i) => i.id)).toEqual(["3"]);
    expect(missingRequired(items, { "1": "done", "3": "na" })).toEqual([]);
  });
  it("line totals are exact integers", () => {
    expect(lineTotalMinor(10, 4000)).toBe(40_000);
    expect(lineTotalMinor(0.333, 1000)).toBe(333);
    expect(lineTotalMinor(3, 1999, 800)).toBe(6477); // 5997 + 8% = 6476.76 -> 6477
    expect(requisitionTotal([{ qty: 2, unitPriceMinor: 500 }, { qty: 1, unitPriceMinor: 250, taxBp: 1000 }])).toBe(1275);
  });
});

describe("csv", () => {
  it("quotes and defuses spreadsheet formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", '"q"'], ["=SUM(A1)", null]])).toBe('a,b\r\n"x,y","""q"""\r\n\'=SUM(A1),\r\n');
  });
});

describe("auth primitives", () => {
  it("TOTP matches the RFC 6238 SHA-1 vector", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // ASCII "12345678901234567890"
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totp(secret, 59_000, 8)).toBe("94287082");
    expect(totp(secret, 1_111_111_109_000, 8)).toBe("07081804");
  });
  it("accepts one step of drift, rejects the rest", () => {
    const s = newSecret(); const now = 1_700_000_000_000;
    expect(verifyTotp(s, totp(s, now), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 30_000), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 120_000), now)).toBe(false);
    expect(verifyTotp(s, "12345", now)).toBe(false);
  });
  it("hashes passwords with a per-user salt and verifies them", async () => {
    const h1 = await hashPassword("correct horse battery"); const h2 = await hashPassword("correct horse battery");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("correct horse battery", h1)).toBe(true);
    expect(await verifyPassword("wrong", h1)).toBe(false);
  });
  it("rejects weak passwords", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("aaaaaaaaaaaa")).not.toBeNull();
    expect(passwordProblem("maria.santos-2026", "maria.santos@x.com")).not.toBeNull();
    expect(passwordProblem("a long unusual passphrase", "x@y.com")).toBeNull();
  });
});

import { canMoveBranch } from "./branch-lifecycle";
describe("branch lifecycle", () => {
  it("allows the normal path and cancelling a closure", () => {
    expect(canMoveBranch("planned", "opening")).toBe(true);
    expect(canMoveBranch("active", "suspended")).toBe(true);
    expect(canMoveBranch("closing", "active")).toBe(true);
  });
  it("closed is final and you cannot skip closure", () => {
    expect(canMoveBranch("closed", "active")).toBe(false);
    expect(canMoveBranch("active", "closed")).toBe(false);
    expect(canMoveBranch("suspended", "opening")).toBe(false);
  });
});

import { zonedToIso } from "../format";
describe("branch-timezone deadlines", () => {
  it("interprets a local time in the branch's zone", () => {
    expect(zonedToIso("2026-11-05T17:00", "America/New_York")).toBe("2026-11-05T22:00:00.000Z"); // EST, UTC-5
    expect(zonedToIso("2026-07-05T17:00", "America/New_York")).toBe("2026-07-05T21:00:00.000Z"); // EDT, UTC-4
    expect(zonedToIso("2026-11-05T09:00", "Asia/Kolkata")).toBe("2026-11-05T03:30:00.000Z");
  });
});

import { checkUpload } from "../files";
describe("uploads", () => {
  it("accepts allowed types and checks magic bytes", () => {
    expect(checkUpload("proof.pdf", Uint8Array.from([0x25, 0x50, 0x44, 0x46, 1])).ok).toBe(true);
    expect(checkUpload("note.txt", Uint8Array.from([104, 105])).ok).toBe(true);
  });
  it("rejects scripts, fakes, empty and oversized files", () => {
    expect(checkUpload("run.exe", Uint8Array.from([1])).ok).toBe(false);
    expect(checkUpload("page.html", Uint8Array.from([1])).ok).toBe(false);
    expect(checkUpload("fake.png", Uint8Array.from([1, 2, 3])).ok).toBe(false);
    expect(checkUpload("a.txt", new Uint8Array(0)).ok).toBe(false);
    expect(checkUpload("big.txt", new Uint8Array(5 * 1024 * 1024 + 1)).ok).toBe(false);
  });
  it("sanitises the stored name", () => {
    const r = checkUpload("../../etc/pass wd<script>.txt", Uint8Array.from([1]));
    expect(r.ok && r.safeName.includes("/")).toBe(false);
  });
});

import { parseItems } from "./inspection";
describe("inspection template parsing", () => {
  it("parses item, weight and critical", () => {
    expect(parseItems("Clean | 2\nFire safety | 3 | critical\n\nUniform")).toEqual([
      { id: "i1", text: "Clean", weight: 2, critical: false }, { id: "i2", text: "Fire safety", weight: 3, critical: true }, { id: "i3", text: "Uniform", weight: 1, critical: false }]);
  });
  it("rejects bad weights with the line number", () => {
    expect(() => parseItems("ok | 2\nbad | 9")).toThrow(/Line 2/);
    expect(() => parseItems("x | 1.5")).toThrow(/Line 1/);
  });
});

import { overBudget, readiness, type ProjectItem } from "./projects";
import { OPENING_TEMPLATES, templateFor } from "../templates/opening";
describe("opening projects", () => {
  const mk = (over: Partial<ProjectItem>): ProjectItem => ({ id: "x", category: "site", title: "t", required: true, status: "todo", costMinor: 0, ...over });
  it("cannot launch with required work outstanding", () => {
    const r = readiness([mk({ status: "done" }), mk({ id: "b" }), mk({ id: "c", required: false })], "2026-11-05");
    expect(r.canLaunch).toBe(false); expect(r.pct).toBe(50); expect(r.reasons[0]).toMatch(/1 required item not finished/);
  });
  it("a blocked item stops launch even if the required work is done", () => {
    const r = readiness([mk({ status: "done" }), mk({ id: "o", required: false, status: "blocked" })], "2026-11-05");
    expect(r.canLaunch).toBe(false); expect(r.blocked).toBe(1);
  });
  it("launches when every required item is done and nothing is blocked; optional items don't count", () => {
    const r = readiness([mk({ status: "done" }), mk({ id: "o", required: false })], "2026-11-05");
    expect(r.canLaunch).toBe(true); expect(r.pct).toBe(100);
  });
  it("an empty project is not ready, and spend and overdue are tallied", () => {
    expect(readiness([], "2026-11-05").canLaunch).toBe(false);
    const r = readiness([mk({ costMinor: 1500, dueOn: "2026-11-01" }), mk({ id: "d", status: "done", costMinor: 500, dueOn: "2026-10-01" })], "2026-11-05");
    expect(r.spentMinor).toBe(2000); expect(r.overdue).toBe(1); expect(overBudget(1900, 2000)).toBe(true); expect(overBudget(0, 2000)).toBe(false);
  });
  it("every industry template is usable and distinct from the generic one", () => {
    for (const [k, t] of Object.entries(OPENING_TEMPLATES)) {
      expect(t.items.filter((i) => i.required).length, k).toBeGreaterThanOrEqual(6);
      expect(new Set(t.items.map((i) => i.category)).size, k).toBeGreaterThanOrEqual(5);
    }
    expect(templateFor("restaurants").items.some((i) => /Food/.test(i.title))).toBe(true);
    expect(templateFor("printing").items.some((i) => /printers/.test(i.title))).toBe(true);
    expect(templateFor("nonsense")).toBe(OPENING_TEMPLATES.general);
  });
});

import { agreementProblem, approvalBlockers, canMove, daysUntil, nextStart, renewalDue } from "./franchise";
describe("franchise pipeline", () => {
  it("moves one step at a time and can fall out, but approval is not a drag-and-drop move", () => {
    expect(canMove("enquiry", "qualified")).toBe(true); expect(canMove("enquiry", "proposal")).toBe(false);
    expect(canMove("review", "approved")).toBe(false); expect(canMove("rejected", "enquiry")).toBe(false); expect(canMove("meeting", "withdrawn")).toBe(true);
  });
  it("lists what blocks approval", () => {
    expect(approvalBlockers("meeting", [], false)).toEqual(["The application must be in review", "Reserve a territory first", "Add the qualification and document checks"]);
    const checks = [{ kind: "document" as const, status: "verified" as const }, { kind: "qualification" as const, status: "received" as const }, { kind: "document" as const, status: "rejected" as const }];
    expect(approvalBlockers("review", checks, true)).toEqual(["1 check not yet verified", "1 check rejected"]);
    expect(approvalBlockers("review", [{ kind: "document", status: "verified" }], true)).toEqual([]);
  });
  it("validates agreement dates and reminders", () => {
    expect(agreementProblem({ start: "2026-01-01", end: "2025-01-01", reminderDays: 90 })).toMatch(/after it starts/);
    expect(agreementProblem({ start: "2026-01-01", end: "2031-01-01", reminderDays: 3 })).toMatch(/Renewal reminders/);
    expect(agreementProblem({ start: "2026-01-01", end: "2031-01-01", reminderDays: 90 })).toBeNull();
  });
  it("computes renewal windows and the next term's start", () => {
    expect(daysUntil("2026-12-31", "2026-11-05")).toBe(56); expect(renewalDue("2026-12-31", 90, "2026-11-05")).toBe(true); expect(renewalDue("2027-12-31", 90, "2026-11-05")).toBe(false); expect(renewalDue("2026-10-01", 90, "2026-11-05")).toBe(false);
    expect(nextStart("2026-12-31")).toBe("2027-01-01"); expect(nextStart("2028-02-28")).toBe("2028-02-29");
  });
});

import { hashKey, isPrivateAddress, keyMatches, newApiKey, nextDelay, parseApiKey, signPayload, urlProblem, verifySignature } from "../integrations/security";
describe("integration security", () => {
  it("signs and verifies payloads, and rejects tampering, wrong secrets and stale timestamps", () => {
    const sig = signPayload("s3cret", '{"a":1}', 1_700_000_000);
    expect(verifySignature("s3cret", '{"a":1}', sig, 1_700_000_100)).toBe(true);
    expect(verifySignature("s3cret", '{"a":2}', sig, 1_700_000_100)).toBe(false);
    expect(verifySignature("other", '{"a":1}', sig, 1_700_000_100)).toBe(false);
    expect(verifySignature("s3cret", '{"a":1}', sig, 1_700_001_000)).toBe(false);
    expect(verifySignature("s3cret", '{"a":1}', "garbage")).toBe(false);
  });
  it("generates API keys that can be found by prefix and verified by hash, never stored in the clear", () => {
    const k = newApiKey(); expect(parseApiKey(k.raw)?.prefix).toBe(k.prefix); expect(k.hash).toBe(hashKey(k.raw)); expect(k.hash).not.toContain(k.raw);
    expect(keyMatches(k.raw, k.hash)).toBe(true); expect(keyMatches(k.raw + "x", k.hash)).toBe(false); expect(parseApiKey("nope")).toBeNull(); expect(newApiKey().raw).not.toBe(k.raw);
  });
  it("blocks private, loopback, metadata and malformed targets", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "not-an-ip"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("accepts only https addresses without credentials", () => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE;   // the e2e environment sets it; this test is about the production behaviour
    expect(urlProblem("https://hooks.example.com/x")).toBeNull();
    expect(urlProblem("http://hooks.example.com/x")).toMatch(/https/); expect(urlProblem("https://user:pw@example.com")).toMatch(/username/); expect(urlProblem("https://localhost/x")).toMatch(/can't be reached/); expect(urlProblem("ftp://x.com")).toMatch(/https/); expect(urlProblem("nonsense")).toMatch(/full web address/);
  });
  it("backs off between retries", () => { expect([1, 2, 3, 4, 5].map(nextDelay)).toEqual([60, 300, 1800, 7200, 43200]); expect(nextDelay(9)).toBe(43200); });
});

import { isDue } from "./../reports-schedule";
describe("scheduled report timing", () => {
  const at = (iso: string) => new Date(iso + "T08:00:00Z");
  it("runs daily reports once a day", () => { expect(isDue({ frequency: "daily", weekday: null, last_run_at: null }, at("2026-11-05"))).toBe(true); expect(isDue({ frequency: "daily", weekday: null, last_run_at: at("2026-11-05") }, at("2026-11-05"))).toBe(false); expect(isDue({ frequency: "daily", weekday: null, last_run_at: at("2026-11-04") }, at("2026-11-05"))).toBe(true); });
  it("runs weekly reports only on their weekday (Thursday = 4)", () => { expect(isDue({ frequency: "weekly", weekday: 4, last_run_at: null }, at("2026-11-05"))).toBe(true); expect(isDue({ frequency: "weekly", weekday: 4, last_run_at: null }, at("2026-11-06"))).toBe(false); });
  it("runs monthly reports on the 1st", () => { expect(isDue({ frequency: "monthly", weekday: null, last_run_at: null }, at("2026-12-01"))).toBe(true); expect(isDue({ frequency: "monthly", weekday: null, last_run_at: null }, at("2026-12-02"))).toBe(false); });
});

import { keyFromLabel, parseCustom, parseOptions, showValue, type FieldDef } from "./studio";
describe("configuration studio", () => {
  const defs: FieldDef[] = [
    { key: "seats", label: "Seats", kind: "number", options: [], required: false },
    { key: "format", label: "Format", kind: "select", options: ["Kiosk", "Dine-in"], required: true },
    { key: "opened", label: "Opened", kind: "date", options: [], required: false },
    { key: "drive", label: "Drive-through", kind: "checkbox", options: [], required: false },
  ];
  const form = (o: Record<string, string>) => (n: string) => o[n] ?? null;
  it("makes stable keys from labels", () => { expect(keyFromLabel("Seating capacity")).toBe("seating_capacity"); expect(keyFromLabel("  2nd floor! ")).toBe("f_2nd_floor"); });
  it("reads valid values, skipping empty optional ones", () => {
    const r = parseCustom(defs, form({ cf_seats: "40", cf_format: "Kiosk", cf_drive: "on" })); expect(r.error).toBeUndefined();
    expect(r.values).toEqual({ seats: 40, format: "Kiosk", drive: true });
  });
  it("refuses bad numbers, dates, options and missing required fields", () => {
    expect(parseCustom(defs, form({ cf_seats: "lots", cf_format: "Kiosk" })).error).toMatch(/Seats must be a number/);
    expect(parseCustom(defs, form({ cf_format: "Kiosk", cf_opened: "31/12/2026" })).error).toMatch(/Opened must be a date/);
    expect(parseCustom(defs, form({ cf_format: "Truck" })).error).toMatch(/Format: choose one/);
    expect(parseCustom(defs, form({})).error).toMatch(/Format is required/);
  });
  it("shows values readably", () => { expect(showValue(defs[3]!, true)).toBe("Yes"); expect(showValue(defs[0]!, undefined)).toBe("—"); });
  it("splits and de-duplicates options", () => { expect(parseOptions("a, b\nb ,c,,")).toEqual(["a", "b", "c"]); });
});

import { buildQuery, validateSpec, columnCatalog } from "./report-builder";
describe("custom report builder", () => {
  const base = { dataset: "tasks" as const, columns: ["title", "status"], filters: {} };
  it("builds a query only from whitelisted columns", () => {
    const q = buildQuery(base); expect(q.sql).toMatch(/^select t\.title, t\.status from tasks t/); expect(q.headers).toEqual(["Title", "Status"]); expect(q.params).toEqual([]);
  });
  it("parameterises filters and sorts safely", () => {
    const q = buildQuery({ ...base, filters: { status: "open", from: "2026-01-01", to: "2026-01-31" }, sort: "title", desc: true }, [], 50);
    expect(q.params).toEqual(["open", "2026-01-01", "2026-01-31"]); expect(q.sql).toMatch(/t\.status = \$2/); expect(q.sql).toMatch(/order by t\.title desc nulls last limit 50$/);
  });
  it("rejects anything outside the whitelists", () => {
    expect(validateSpec({ ...base, columns: ["title; drop table tasks"] })).toMatch(/isn't available/);
    expect(validateSpec({ ...base, columns: [] })).toMatch(/at least one/);
    expect(validateSpec({ ...base, filters: { status: "nope" } })).toMatch(/status/);
    expect(validateSpec({ ...base, filters: { from: "01/01/2026" } })).toMatch(/Dates/);
    expect(validateSpec({ ...base, filters: { from: "2026-02-01", to: "2026-01-01" } })).toMatch(/after/);
    expect(validateSpec({ ...base, sort: "priority" })).toMatch(/Sort by/);
    expect(validateSpec({ ...base, dataset: "users" as never })).toMatch(/Choose/);
  });
  it("offers the company's custom fields as columns", () => {
    const defs: FieldDef[] = [{ key: "cost_code", label: "Cost code", kind: "text", options: [], required: false }];
    expect(columnCatalog("tasks", defs).some((c) => c.id === "cf:cost_code")).toBe(true);
    expect(buildQuery({ ...base, columns: ["title", "cf:cost_code"] }, defs).sql).toContain("t.custom ->> 'cost_code'");
    expect(() => buildQuery({ ...base, columns: ["cf:cost_code"] })).toThrow();
  });
});

import { NAV } from "../nav";
import { ES } from "../i18n-es";
describe("Spanish coverage", () => {
  it("translates every menu group and item", () => {
    const missing = NAV.flatMap((g) => [g.label, ...g.items.map((i) => i.label)]).filter((l) => !ES[l]);
    expect(missing).toEqual([]);
  });
  it("never maps a string to an empty translation", () => { expect(Object.values(ES).filter((v) => !v.trim())).toEqual([]); });
});
