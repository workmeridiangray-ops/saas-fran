/** Franchise applicant pipeline (brief §9). A prospect is never an active partner until an agreement is active. */
export type Stage = "enquiry" | "qualified" | "meeting" | "proposal" | "review" | "approved" | "rejected" | "withdrawn";
export const STAGES: Stage[] = ["enquiry", "qualified", "meeting", "proposal", "review", "approved"];
export const STAGE_LABEL: Record<Stage, string> = { enquiry: "Enquiry", qualified: "Qualified", meeting: "Meeting / site visit", proposal: "Proposal", review: "Application review", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" };

const NEXT: Record<Stage, Stage[]> = {
  enquiry: ["qualified", "rejected", "withdrawn"], qualified: ["meeting", "enquiry", "rejected", "withdrawn"], meeting: ["proposal", "qualified", "rejected", "withdrawn"],
  proposal: ["review", "meeting", "rejected", "withdrawn"], review: ["proposal", "rejected", "withdrawn"],   // "approved" only through the approval function
  approved: [], rejected: [], withdrawn: [],
};
export const canMove = (from: Stage, to: Stage) => NEXT[from].includes(to);
export const moves = (from: Stage) => NEXT[from];

export interface Check { kind: "qualification" | "document"; status: "open" | "received" | "verified" | "rejected" }
/** What stops an application from being approved. */
export function approvalBlockers(stage: Stage, checks: Check[], hasTerritory: boolean): string[] {
  const out: string[] = [];
  if (stage !== "review") out.push("The application must be in review");
  if (!hasTerritory) out.push("Reserve a territory first");
  const open = checks.filter((c) => c.status === "open" || c.status === "received").length;
  const bad = checks.filter((c) => c.status === "rejected").length;
  if (checks.length === 0) out.push("Add the qualification and document checks");
  if (open) out.push(`${open} check${open > 1 ? "s" : ""} not yet verified`);
  if (bad) out.push(`${bad} check${bad > 1 ? "s" : ""} rejected`);
  return out;
}

export interface AgreementDates { start: string; end: string; reminderDays: number }
export function agreementProblem(a: AgreementDates): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.start) || !/^\d{4}-\d{2}-\d{2}$/.test(a.end)) return "Set the start and end dates.";
  if (a.end <= a.start) return "The agreement must end after it starts.";
  if (!(a.reminderDays >= 7 && a.reminderDays <= 365)) return "Renewal reminders must be between 7 and 365 days before the end.";
  return null;
}
export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10)) - Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10))) / 86_400_000);
}
export const renewalDue = (endIso: string, reminderDays: number, todayIso: string) => { const d = daysUntil(endIso, todayIso); return d >= 0 && d <= reminderDays; };
export function nextStart(endIso: string): string { const d = new Date(endIso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
