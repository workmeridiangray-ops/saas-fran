import { applyBasisPoints, type LedgerKind, type Minor } from "./money";

/**
 * Franchise royalties (brief §17). Versioned rules with effective dates,
 * integer money, a draft → review → approved → issued statement lifecycle,
 * and payment allocation that never mixes ledger kinds.
 */
export type RoyaltyRule =
  | { id: string; version: number; effectiveFrom: string; effectiveTo?: string; type: "fixed"; fixedMinor: Minor }
  | { id: string; version: number; effectiveFrom: string; effectiveTo?: string; type: "percent"; rateBp: number }
  | {
      id: string; version: number; effectiveFrom: string; effectiveTo?: string;
      type: "percent_with_minimum"; rateBp: number; minimumMinor: Minor;
    };

/** ISO dates (YYYY-MM-DD) compare correctly as strings. */
export function ruleFor(rules: RoyaltyRule[], date: string): RoyaltyRule {
  const hits = rules.filter((r) => r.effectiveFrom <= date && (!r.effectiveTo || date <= r.effectiveTo));
  if (hits.length === 0) throw new Error(`No royalty rule is effective on ${date}`);
  if (hits.length > 1) throw new Error(`Royalty rules overlap on ${date}: ${hits.map((h) => h.id).join(", ")}`);
  return hits[0]!;
}

export interface RoyaltyInput {
  grossSalesMinor: Minor;
  exclusionsMinor: Minor; // e.g. taxes, refunds excluded by agreement
  adjustmentsMinor: Minor; // approved +/- revenue adjustments
}
export interface RoyaltyResult {
  ruleId: string; ruleVersion: number;
  baseMinor: Minor; royaltyMinor: Minor; minimumApplied: boolean;
}

export function calculateRoyalty(rule: RoyaltyRule, input: RoyaltyInput): RoyaltyResult {
  const baseMinor = Math.max(0, input.grossSalesMinor - input.exclusionsMinor + input.adjustmentsMinor);
  let royaltyMinor: Minor;
  let minimumApplied = false;
  switch (rule.type) {
    case "fixed": royaltyMinor = rule.fixedMinor; break;
    case "percent": royaltyMinor = applyBasisPoints(baseMinor, rule.rateBp); break;
    case "percent_with_minimum": {
      const pct = applyBasisPoints(baseMinor, rule.rateBp);
      minimumApplied = pct < rule.minimumMinor;
      royaltyMinor = Math.max(pct, rule.minimumMinor);
      break;
    }
  }
  return { ruleId: rule.id, ruleVersion: rule.version, baseMinor, royaltyMinor, minimumApplied };
}

/* ---------- statement lifecycle ---------- */
export type StatementStatus = "draft" | "in_review" | "approved" | "issued" | "void";
const NEXT: Record<StatementStatus, StatementStatus[]> = {
  draft: ["in_review", "void"],
  in_review: ["draft", "approved", "void"], // sent back with a reason
  approved: ["issued", "void"],
  issued: [], // immutable: corrections are credit notes / adjustments
  void: [],
};
export function canTransition(from: StatementStatus, to: StatementStatus): boolean {
  return NEXT[from].includes(to);
}
export function isEditable(s: StatementStatus): boolean {
  return s === "draft";
}

/* ---------- payment allocation ---------- */
export interface OpenItem { id: string; kind: LedgerKind; dueDate: string; outstandingMinor: Minor }
export interface Allocation { itemId: string; amountMinor: Minor }

/** Oldest due date first; any remainder is returned unallocated, never silently applied. */
export function allocatePayment(
  kind: LedgerKind, paymentMinor: Minor, items: OpenItem[],
): { allocations: Allocation[]; unallocatedMinor: Minor } {
  if (paymentMinor <= 0) throw new Error("Payment must be positive");
  if (items.some((i) => i.kind !== kind)) {
    throw new Error("Cannot allocate across ledgers: SaaS subscription and franchise royalty balances are separate");
  }
  let left = paymentMinor;
  const allocations: Allocation[] = [];
  const ordered = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  for (const item of ordered) {
    if (left === 0) break;
    if (item.outstandingMinor <= 0) continue;
    const amountMinor = Math.min(left, item.outstandingMinor);
    allocations.push({ itemId: item.id, amountMinor });
    left -= amountMinor;
  }
  return { allocations, unallocatedMinor: left };
}
