"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";

const qty = (f: FormData, k: string, label: string) => {
  const n = Number(str(f, k)); if (!(n > 0) || Math.round(n * 1000) / 1000 !== n) return fail(`${label}: enter a positive quantity with at most 3 decimals.`); return n;
};
export async function useStock(f: FormData) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), item = uuid(f, "item_id"); const kind = str(f, "kind") === "wastage" ? "wastage" : "issue";
  return run("/stock", "/stock", kind === "wastage" ? "Wastage recorded." : "Usage recorded.", async () => {
    const n = qty(f, "qty", "Quantity"); const note = str(f, "note");
    if (kind === "wastage" && note.length < 3) fail("Say why it was wasted.");
    await asUser(ctx.user.id, (db) => db.q("insert into stock_movements(company_id, branch_id, item_id, qty, kind, note) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, branch, item, -n, kind, note]));
  });
}
export async function transferStock(f: FormData) {
  const ctx = await requireCtx(); const from = uuid(f, "from"), to = uuid(f, "to"), item = uuid(f, "item_id");
  return run("/stock", "/stock", "Stock transferred.", async () => { const n = qty(f, "qty", "Quantity"); await asUser(ctx.user.id, (db) => db.q("select public.transfer_stock($1,$2,$3,$4,$5)", [from, to, item, n, str(f, "note")])); });
}
export async function countStock(f: FormData) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), item = uuid(f, "item_id");
  return run("/stock", "/stock", "Count recorded. Any difference was applied to the book level.", async () => {
    const counted = Number(str(f, "counted")); if (!(counted >= 0)) fail("Enter the quantity you counted.");
    const diff = await asUser(ctx.user.id, async (db) => Number((await db.one<{ d: string }>("select public.record_count($1,$2,$3,$4) d", [branch, item, counted, str(f, "note")]))!.d));
    void diff;
  });
}
export async function setReorder(f: FormData) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), item = uuid(f, "item_id");
  return run("/stock", "/stock", "Reorder point saved.", async () => {
    const n = Number(str(f, "point")); if (!(n >= 0)) fail("Enter a reorder point of zero or more.");
    await asUser(ctx.user.id, (db) => db.q("insert into stock_reorder(company_id, branch_id, item_id, reorder_point) values ($1,$2,$3,$4) on conflict (branch_id, item_id) do update set reorder_point = excluded.reorder_point", [ctx.companyId, branch, item, n]));
  });
}
