"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { parseMinor } from "@/lib/rules/money";

export async function addAsset(f: FormData) {
  const ctx = await requireCtx();
  return run("/assets", "/assets", "Asset added.", async () => {
    const name = str(f, "name"); if (name.length < 2) fail("Name the asset.");
    let cost: number | null = null; if (str(f, "cost")) { const c = parseMinor(str(f, "cost")); if (!c.ok) fail(`Cost: ${c.error}`); else cost = c.value; }
    await asUser(ctx.user.id, (db) => db.q("insert into assets(company_id, branch_id, name, serial, warranty_until, cost_minor, notes) values ($1,$2,$3,$4,$5,$6,$7)", [ctx.companyId, uuid(f, "branch_id"), name, str(f, "serial") || null, str(f, "warranty") || null, cost, str(f, "notes")]));
  });
}
export async function setAssetStatus(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const to = str(f, "to");
  return run("/assets", "/assets", "Asset updated.", async () => {
    if (!["active", "under_repair", "disposed"].includes(to)) fail("Unknown status.");
    if (to === "disposed" && !ctx.has("approve", "assets")) fail("Disposal needs approval from someone with that permission.");
    await asUser(ctx.user.id, (db) => db.q("update assets set status = $2 where id = $1", [id, to]));
  });
}
export async function addLicence(f: FormData) {
  const ctx = await requireCtx();
  return run("/assets?tab=licences", "/assets?tab=licences", "Licence added.", async () => {
    const name = str(f, "name"), exp = str(f, "expires_on"); if (name.length < 2) fail("Name the licence or permit."); if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) fail("Set the expiry date.");
    await asUser(ctx.user.id, (db) => db.q("insert into licences(company_id, branch_id, name, expires_on, notes) values ($1,$2,$3,$4,$5)", [ctx.companyId, str(f, "branch_id") || null, name, exp, str(f, "notes")]));
  });
}
export async function renewLicence(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const exp = str(f, "expires_on");
  return run("/assets?tab=licences", "/assets?tab=licences", "Licence renewed.", async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) fail("Set the new expiry date.");
    await asUser(ctx.user.id, (db) => db.q("update licences set expires_on = $2 where id = $1", [id, exp]));
  });
}
