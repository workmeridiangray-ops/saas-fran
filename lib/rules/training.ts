/** Quiz grading, attempt limits and certificate expiry (brief §14). */
export interface Question { q: string; options: string[]; answer: number }
export function gradeQuiz(questions: Question[], given: (number | undefined)[], passMark: number) {
  if (questions.length === 0) return { score: 100, passed: true, correct: 0 };
  const correct = questions.filter((q, i) => given[i] === q.answer).length;
  const score = Math.round((correct / questions.length) * 100);
  return { score, passed: score >= passMark, correct };
}
export function attemptsLeft(max: number, used: number) { return Math.max(0, max - used); }
export function expiryFrom(completedAt: Date, validityDays: number | null): Date | null {
  if (!validityDays) return null;
  const d = new Date(completedAt); d.setUTCDate(d.getUTCDate() + validityDays); return d;
}
export const isExpired = (expiresAt: Date | null, now: Date) => expiresAt !== null && expiresAt.getTime() <= now.getTime();
