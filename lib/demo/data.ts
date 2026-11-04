/**
 * Demo workspace so the screens run without a database. Replace with queries
 * run as the signed-in user (RLS does the scoping). Clearly sample data:
 * the shell shows a "Sample data" badge whenever this module is in use.
 */
import { STARTER_ROLES, type Membership } from "@/lib/rules/permissions";
import type { PlanDef, Usage } from "@/lib/rules/plan-limits";
import type { BranchSnapshot } from "@/lib/rules/branch-closure";

export const company = { id: "c1", name: "Acme Foods", currency: "USD", timezone: "America/New_York", model: "Mixed network" };
export const workspaces = [
  { id: "c1", name: "Acme Foods", role: "Company owner", sample: true },
  { id: "c2", name: "Harbour Print Co.", role: "Regional manager", sample: true },
];
export const me: Membership = {
  userId: "u-demo", companyId: "c1", status: "active",
  roles: [STARTER_ROLES.find((r) => r.id === "owner")!], scope: {}, approvalLimitMinor: 5_000_000,
};
export const UPDATED = "4 Nov 2026, 09:12";

export type BranchStatus = "active" | "opening" | "suspended" | "closing" | "closed";
export interface Branch {
  code: string; name: string; region: string; brand: string; ownership: "Company" | "Franchise";
  partner?: string; status: BranchStatus; manager: string; complianceScore: number; openItems: number;
}
export const branches: Branch[] = [
  { code: "AD1", name: "Downtown", region: "East", brand: "Acme Grill", ownership: "Company", status: "active", manager: "Priya Nair", complianceScore: 94, openItems: 2 },
  { code: "AH2", name: "Harbour", region: "West", brand: "Acme Grill", ownership: "Franchise", partner: "Lakeside Foods LLC", status: "active", manager: "Tom Reyes", complianceScore: 81, openItems: 6 },
  { code: "AM3", name: "Midtown", region: "East", brand: "Acme Grill", ownership: "Company", status: "active", manager: "Sara Cho", complianceScore: 88, openItems: 3 },
  { code: "AN4", name: "North Gate", region: "North", brand: "Acme Express", ownership: "Franchise", partner: "Lakeside Foods LLC", status: "opening", manager: "Ken Ito", complianceScore: 0, openItems: 11 },
  { code: "AS5", name: "Southside", region: "West", brand: "Acme Express", ownership: "Franchise", partner: "Reyes Group", status: "suspended", manager: "Unassigned", complianceScore: 62, openItems: 9 },
  { code: "AP6", name: "Airport T2", region: "East", brand: "Acme Express", ownership: "Company", status: "closing", manager: "Dana Wu", complianceScore: 76, openItems: 14 },
];

export const attention = [
  { id: 1, tone: "danger" as const, label: "Overdue", text: "Cold-storage temperature log missed at Harbour (2 days)", href: "/branches?status=active" },
  { id: 2, tone: "warn" as const, label: "Due soon", text: "Fire licence at Midtown expires in 9 days", href: "/m/assets" },
  { id: 3, tone: "danger" as const, label: "Unpaid", text: "Royalty statement Oct-2026 overdue: Lakeside Foods LLC", href: "/m/royalties" },
  { id: 4, tone: "info" as const, label: "Needs you", text: "3 purchase requests wait for your approval", href: "/approvals" },
  { id: 5, tone: "warn" as const, label: "Unacknowledged", text: "SOP 'Allergen handling v4' unread by 12 staff", href: "/m/knowledge" },
];

export interface Approval {
  id: string; title: string; kind: string; branch: string; requester: string; amountMinor: number;
  submitted: string; dueIn: string; evidence: string[]; history: { by: string; what: string; at: string }[];
  budgetNote: string;
}
export const approvals: Approval[] = [
  { id: "PR-1042", title: "Walk-in freezer compressor", kind: "Purchase request", branch: "Harbour", requester: "Tom Reyes", amountMinor: 1_284_000,
    submitted: "2 Nov", dueIn: "1 day", evidence: ["Quote-Coldtech.pdf", "Breakdown-photo.jpg", "Service-report-0931.pdf"],
    history: [{ by: "Tom Reyes", what: "Submitted", at: "2 Nov 14:05" }, { by: "Priya Nair", what: "Approved (step 1 of 2)", at: "3 Nov 10:20" }],
    budgetNote: "Uses 38% of Harbour's remaining equipment budget" },
  { id: "PR-1045", title: "Packaging: 40 cases bowls", kind: "Purchase request", branch: "Downtown", requester: "Priya Nair", amountMinor: 184_000,
    submitted: "3 Nov", dueIn: "3 days", evidence: ["Quote-PackCo.pdf"], history: [{ by: "Priya Nair", what: "Submitted", at: "3 Nov 08:40" }],
    budgetNote: "Within monthly consumables budget" },
  { id: "RF-0211", title: "Customer refund, order 88341", kind: "Refund", branch: "Midtown", requester: "Sara Cho", amountMinor: 4_250,
    submitted: "4 Nov", dueIn: "2 days", evidence: ["Complaint-0442"], history: [{ by: "Sara Cho", what: "Submitted", at: "4 Nov 07:55" }],
    budgetNote: "No budget impact" },
];

export const plans: Record<string, PlanDef & { name: string; priceMinor: number }> = {
  starter: { id: "starter", version: 4, name: "Starter", priceMinor: 9_900, limits: { branches: 3, users: 10, storageMb: 5_000 }, modules: ["tasks", "documents", "tickets", "people"] },
  growth: { id: "growth", version: 4, name: "Growth", priceMinor: 29_900, limits: { branches: 25, users: 60, storageMb: 50_000 }, modules: ["tasks", "documents", "tickets", "people", "inspections", "purchasing", "training"] },
  scale: { id: "scale", version: 4, name: "Scale", priceMinor: 79_900, limits: { branches: null, users: null, storageMb: 500_000 }, modules: ["tasks", "documents", "tickets", "people", "inspections", "purchasing", "training", "royalties", "studio", "franchise", "assets", "inventory"] },
};
export const currentPlanId = "growth";
export const usage: Usage = {
  branches: 6, users: 34, storageMb: 7_800,
  openWorkByModule: { purchasing: 3, inspections: 4 },
  enabledModules: ["tasks", "documents", "tickets", "people", "inspections", "purchasing", "training"],
};

export const closureSnapshot: BranchSnapshot = {
  pendingOrders: 2, stockUnitsOnHand: 140, openDuesMinor: 18_250, assetsAssigned: 7, activeIntegrations: 1, openTasks: 3,
  activeUsers: [
    { id: "u1", name: "Dana Wu", alsoAssignedElsewhere: false },
    { id: "u2", name: "Lee Park", alsoAssignedElsewhere: true },
    { id: "u3", name: "Mo Haddad", alsoAssignedElsewhere: false },
  ],
};
