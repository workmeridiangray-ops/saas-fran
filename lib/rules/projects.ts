/** Opening-project readiness (brief §10). Launch needs every required item done and nothing blocked. */
export type ItemStatus = "todo" | "doing" | "done" | "blocked";
export interface ProjectItem { id: string; category: string; title: string; required: boolean; status: ItemStatus; costMinor: number; dueOn?: string | null }

export interface Readiness {
  total: number; done: number; requiredTotal: number; requiredDone: number; blocked: number;
  pct: number; canLaunch: boolean; reasons: string[]; spentMinor: number;
  byCategory: Record<string, { done: number; total: number }>;
}
export function readiness(items: ProjectItem[], todayIso: string): Readiness & { overdue: number } {
  const req = items.filter((i) => i.required);
  const blocked = items.filter((i) => i.status === "blocked").length;
  const requiredDone = req.filter((i) => i.status === "done").length;
  const byCategory: Readiness["byCategory"] = {};
  for (const i of items) { const c = (byCategory[i.category] ??= { done: 0, total: 0 }); c.total++; if (i.status === "done") c.done++; }
  const reasons: string[] = [];
  if (req.length === 0) reasons.push("Add the items that must be done before opening.");
  if (requiredDone < req.length) reasons.push(`${req.length - requiredDone} required item${req.length - requiredDone > 1 ? "s" : ""} not finished`);
  if (blocked > 0) reasons.push(`${blocked} item${blocked > 1 ? "s are" : " is"} blocked`);
  return {
    total: items.length, done: items.filter((i) => i.status === "done").length, requiredTotal: req.length, requiredDone, blocked,
    pct: req.length === 0 ? 0 : Math.round((requiredDone / req.length) * 100), canLaunch: reasons.length === 0, reasons,
    spentMinor: items.reduce((n, i) => n + i.costMinor, 0), byCategory,
    overdue: items.filter((i) => i.status !== "done" && i.dueOn && i.dueOn < todayIso).length,
  };
}
export const overBudget = (budgetMinor: number, spentMinor: number) => budgetMinor > 0 && spentMinor > budgetMinor;
