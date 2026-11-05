/** Checklist submission needs every required item answered; unticked required items block submit. */
export interface ChecklistItem { id: string; text: string; required: boolean }
export function missingRequired(items: ChecklistItem[], answers: Record<string, string | undefined>): ChecklistItem[] {
  return items.filter((i) => i.required && answers[i.id] !== "done" && answers[i.id] !== "na");
}
