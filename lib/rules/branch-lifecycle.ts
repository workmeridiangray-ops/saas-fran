/** Branch status machine (brief §8). Suspending or closing never deletes anything. */
export type BranchStatus = "planned" | "opening" | "active" | "suspended" | "closing" | "closed";
const NEXT: Record<BranchStatus, BranchStatus[]> = {
  planned: ["opening", "active", "closing"],
  opening: ["active", "closing"],
  active: ["suspended", "closing"],
  suspended: ["active", "closing"],
  closing: ["active", "closed"],   // closure can be cancelled; closed is final
  closed: [],
};
export const canMoveBranch = (from: BranchStatus, to: BranchStatus) => NEXT[from].includes(to);
export const nextBranchStates = (from: BranchStatus) => NEXT[from];
export const BRANCH_LABEL: Record<BranchStatus, string> = {
  planned: "Planned", opening: "Opening", active: "Active", suspended: "Suspended", closing: "Closing", closed: "Closed",
};
