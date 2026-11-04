/**
 * Branch closure (brief §8). A branch can only close once every outstanding
 * item is resolved or explicitly carried over; then access is removed and
 * retention starts. Each item says what to do next.
 */
export interface BranchSnapshot {
  pendingOrders: number;
  stockUnitsOnHand: number;
  openDuesMinor: number;
  assetsAssigned: number;
  activeIntegrations: number;
  activeUsers: { id: string; name: string; alsoAssignedElsewhere: boolean }[];
  openTasks: number;
}
export type ClosureItemId = "orders" | "stock" | "dues" | "assets" | "integrations" | "users" | "tasks";
export interface ClosureItem {
  id: ClosureItemId;
  label: string;
  outstanding: number;
  action: string;
  resolved: boolean;
}

export function closureChecklist(s: BranchSnapshot, carriedOver: ClosureItemId[] = []): ClosureItem[] {
  const mk = (id: ClosureItemId, label: string, outstanding: number, action: string): ClosureItem => ({
    id, label, outstanding, action, resolved: outstanding === 0 || carriedOver.includes(id),
  });
  return [
    mk("orders", "Pending orders", s.pendingOrders, "Complete or cancel each order"),
    mk("stock", "Stock on hand", s.stockUnitsOnHand, "Transfer to another location or record write-off"),
    mk("dues", "Open dues", s.openDuesMinor, "Settle, or approve a write-off with a reason"),
    mk("assets", "Assigned assets", s.assetsAssigned, "Transfer or approve disposal"),
    mk("integrations", "Active integrations", s.activeIntegrations, "Disconnect or move to another branch"),
    mk("tasks", "Open tasks", s.openTasks, "Reassign or close"),
    mk("users", "Users with branch access", s.activeUsers.length, "Remove branch access (shown below)"),
  ];
}

/** Users are handled last: access removal is the final step, never the first. */
export function canClose(items: ClosureItem[]): boolean {
  return items.filter((i) => i.id !== "users").every((i) => i.resolved);
}

export function accessRemovalPlan(s: BranchSnapshot) {
  return s.activeUsers.map((u) => ({
    userId: u.id,
    name: u.name,
    // Someone with another branch keeps their account; others are deactivated.
    action: u.alsoAssignedElsewhere ? ("remove_branch_scope" as const) : ("deactivate_membership" as const),
  }));
}
