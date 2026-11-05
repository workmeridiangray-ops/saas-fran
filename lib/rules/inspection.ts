/** Weighted inspection scoring (brief §13). A critical failure caps the score at 70%. */
export interface TemplateItem { id: string; text: string; weight: number; critical: boolean }
export type Answer = "pass" | "fail" | "na";
export const CRITICAL_CAP = 70;

export interface ScoreResult {
  score: number; criticalFailed: boolean; failed: TemplateItem[]; unanswered: string[];
}
export function scoreInspection(items: TemplateItem[], answers: Record<string, Answer | undefined>): ScoreResult {
  const unanswered = items.filter((i) => !answers[i.id]).map((i) => i.id);
  const failed = items.filter((i) => answers[i.id] === "fail");
  const counted = items.filter((i) => answers[i.id] === "pass" || answers[i.id] === "fail");
  const possible = counted.reduce((n, i) => n + i.weight, 0);
  const earned = counted.filter((i) => answers[i.id] === "pass").reduce((n, i) => n + i.weight, 0);
  const raw = possible === 0 ? 0 : Math.round((earned / possible) * 10_000) / 100;
  const criticalFailed = failed.some((i) => i.critical);
  return { score: criticalFailed ? Math.min(raw, CRITICAL_CAP) : raw, criticalFailed, failed, unanswered };
}
export const severityOf = (i: TemplateItem): "minor" | "major" | "critical" =>
  i.critical ? "critical" : i.weight >= 3 ? "major" : "minor";
