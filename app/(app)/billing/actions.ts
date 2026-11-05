"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str } from "@/lib/flash";

export async function changePlan(f: FormData) {
  const ctx = await requireCtx(); const to = str(f, "to");
  return run(`/billing?to=${to}`, "/billing", "", async () => {
    if (!ctx.has("configure", "billing")) fail("Only a billing owner can change the plan.");
    const when = await asUser(ctx.user.id, async (db) => (await db.one<{ w: string }>("select public.request_plan_change($1, $2) w", [ctx.companyId, to]))!.w);
    return `/billing?changed=${when}`;
  });
}
export async function cancelPendingChange() {
  const ctx = await requireCtx();
  return run("/billing", "/billing", "Scheduled plan change cancelled.", async () => {
    if (!ctx.has("configure", "billing")) fail("Only a billing owner can change the plan.");
    await asUser(ctx.user.id, async (db) => {
      const s = await db.one<{ plan_id: string }>("select plan_id from subscriptions where company_id = $1", [ctx.companyId]);
      // Re-requesting the current plan clears nothing on its own, so use the same function and let it store "current" as pending.
      await db.q("select public.request_plan_change($1, $2)", [ctx.companyId, s!.plan_id]);
    });
  });
}
export async function closeCompany(f: FormData) {
  const ctx = await requireCtx(); const confirm = str(f, "confirm");
  return run("/billing", "/billing", "Closure started. The workspace stays readable so you can export your data.", async () => {
    if (confirm !== ctx.company.name) fail("Type the company name exactly to confirm.");
    await asUser(ctx.user.id, (db) => db.q("select public.close_company($1)", [ctx.companyId]));
  });
}
