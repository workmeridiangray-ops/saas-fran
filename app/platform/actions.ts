"use server";
import { asService } from "@/lib/db";
import { fail, run, str, uuid } from "@/lib/flash";
import { platformAudit, requireStaff } from "@/lib/platform";
import { parseMinor } from "@/lib/rules/money";

export async function setCompanyStatus(f: FormData) {
  const staff = await requireStaff(["super_admin", "billing"]); const id = uuid(f, "id"); const to = str(f, "to"); const reason = str(f, "reason");
  return run(`/platform/companies/${id}`, `/platform/companies/${id}`, to === "suspended" ? "Company suspended." : "Company reactivated.", async () => {
    if (!["suspended", "active"].includes(to)) fail("Unknown status.");
    if (reason.length < 5) fail("Record why, for the audit trail.");
    await asService(async (db) => {
      await db.q("update companies set status = $2 where id = $1 and status <> 'closed'", [id, to]);
      await platformAudit(db, staff.user.id, id, "companies", `status:${to}:${reason}`.slice(0, 200), id);
    }, staff.user.id);
  });
}
export async function markInvoicePaid(f: FormData) {
  const staff = await requireStaff(["super_admin", "billing"]); const id = uuid(f, "id"); const back = str(f, "back").startsWith("/platform") ? str(f, "back") : "/platform/invoices";
  return run(back, back, "Payment recorded. The company is active again.", async () => {
    await asService(async (db) => {
      await db.q("select app.mark_invoice_paid($1)", [id]);
      await platformAudit(db, staff.user.id, null, "platform_invoices", "paid", id);
    }, staff.user.id);
  });
}
export async function voidInvoice(f: FormData) {
  const staff = await requireStaff(["super_admin", "billing"]); const id = uuid(f, "id");
  return run("/platform/invoices", "/platform/invoices", "Invoice voided.", async () => {
    await asService(async (db) => { await db.q("update platform_invoices set status = 'void' where id = $1 and status = 'open'", [id]); await platformAudit(db, staff.user.id, null, "platform_invoices", "void", id); }, staff.user.id);
  });
}
/** A plan edit never touches existing versions: it appends a new version that new subscriptions and renewals pick up. */
export async function newPlanVersion(f: FormData) {
  const staff = await requireStaff(["super_admin"]); const plan = str(f, "plan_id");
  return run("/platform/plans", "/platform/plans", "New plan version published. Existing subscribers keep their current version until they change plan.", async () => {
    const price = parseMinor(str(f, "price")); if (!price.ok) fail(`Price: ${price.error}`);
    const n = (k: string) => { const v = str(f, k); return v === "" ? null : Number(v); };
    const modules = str(f, "modules").split(",").map((x) => x.trim()).filter(Boolean);
    if (modules.length === 0) fail("List the included modules, separated by commas.");
    await asService(async (db) => {
      const v = (await db.one<{ v: number }>("select coalesce(max(version),0)+1 v from plan_versions where plan_id = $1", [plan]))!.v;
      if (v === 1) fail("Unknown plan.");
      await db.q("insert into plan_versions(plan_id, version, monthly_price_minor, max_branches, max_users, storage_mb, modules) values ($1,$2,$3,$4,$5,$6,$7)", [plan, v, price.ok ? price.value : 0, n("max_branches"), n("max_users"), n("storage_mb"), modules]);
      await platformAudit(db, staff.user.id, null, "plan_versions", `new:${plan}:v${v}`, plan);
    }, staff.user.id);
  });
}
