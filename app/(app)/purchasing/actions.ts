"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { lineTotalMinor } from "@/lib/rules/purchase";
import { submitForApproval } from "@/lib/data/approvals";
import { parseMinor } from "@/lib/rules/money";

export async function addSupplier(f: FormData) {
  const ctx = await requireCtx(); const name = str(f, "name");
  return run("/purchasing?tab=suppliers", "/purchasing?tab=suppliers", `${name} added.`, async () => {
    if (name.length < 2) fail("Enter the supplier's name.");
    await asUser(ctx.user.id, (db) => db.q("insert into suppliers(company_id, name, contact_email) values ($1,$2,$3)", [ctx.companyId, name, str(f, "email") || null]));
  });
}
export async function addItem(f: FormData) {
  const ctx = await requireCtx(); const supplier = uuid(f, "supplier_id");
  return run("/purchasing?tab=suppliers", "/purchasing?tab=suppliers", "Item added to the catalogue.", async () => {
    const price = parseMinor(str(f, "price")); if (!price.ok) fail(`Price: ${price.error}`);
    const tax = Number(str(f, "tax") || "0"); if (!(tax >= 0 && tax <= 100)) fail("Tax must be between 0 and 100%.");
    if (str(f, "sku").length < 1 || str(f, "name").length < 2) fail("Enter the item's code and name.");
    await asUser(ctx.user.id, (db) => db.q("insert into catalog_items(company_id, supplier_id, sku, name, unit, unit_price_minor, tax_bp) values ($1,$2,$3,$4,$5,$6,$7)",
      [ctx.companyId, supplier, str(f, "sku"), str(f, "name"), str(f, "unit") || "each", price.ok ? price.value : 0, Math.round(tax * 100)]));
  });
}

async function createReq(f: FormData, submit: boolean) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), supplier = uuid(f, "supplier_id");
  return run(`/purchasing/new?supplier=${supplier}`, "/purchasing", submit ? "Submitted for approval." : "Draft saved.", async () => {
    const lines = [...f.keys()].filter((k) => k.startsWith("qty:")).map((k) => ({ item: k.slice(4), qty: Number(str(f, k)) })).filter((l) => l.qty > 0);
    if (lines.length === 0) fail("Enter a quantity for at least one item.");
    if (lines.some((l) => !(l.qty > 0 && l.qty <= 1_000_000) || Math.round(l.qty * 1000) / 1000 !== l.qty)) fail("Quantities must be positive, with at most 3 decimals.");
    return asUser(ctx.user.id, async (db) => {
      const items = await db.q<{ id: string; name: string; unit_price_minor: string; tax_bp: number }>("select id, name, unit_price_minor, tax_bp from catalog_items where company_id = $1 and supplier_id = $2 and status = 'active' and id = any($3::uuid[])", [ctx.companyId, supplier, lines.map((l) => l.item)]);
      if (items.length !== lines.length) fail("One of the items isn't available from that supplier.");
      const priced = lines.map((l) => { const it = items.find((i) => i.id === l.item)!; return { ...l, price: Number(it.unit_price_minor), tax: it.tax_bp, total: lineTotalMinor(l.qty, Number(it.unit_price_minor), it.tax_bp) }; });
      const total = priced.reduce((n, l) => n + l.total, 0);
      const number = (await db.one<{ n: string }>("select app.next_number($1,'requisition','REQ') n", [ctx.companyId]))!.n;
      const id = (await db.one<{ id: string }>("insert into requisitions(company_id, branch_id, supplier_id, number, requester_id, note, status, total_minor) values ($1,$2,$3,$4,$5,$6,'draft',$7) returning id", [ctx.companyId, branch, supplier, number, ctx.user.id, str(f, "note"), total]))!.id;
      for (const l of priced) await db.q("insert into requisition_lines(company_id, requisition_id, item_id, qty, unit_price_minor) values ($1,$2,$3,$4,$5)", [ctx.companyId, id, l.item, l.qty, l.price]);
      if (submit) {
        await submitForApproval(db, { companyId: ctx.companyId, userId: ctx.user.id, kind: "purchase", subjectId: id, title: `${number}: ${items.map((i) => i.name).slice(0, 2).join(", ")}${items.length > 2 ? "…" : ""}`, amountMinor: total, branchId: branch });
        await db.q("update requisitions set status = 'submitted' where id = $1", [id]);
      }
      return `/purchasing/${id}`;
    });
  });
}

export async function submitRequisition(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/purchasing/${id}`, `/purchasing/${id}`, "Submitted for approval.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const r = await db.one<{ number: string; total_minor: string; branch_id: string; status: string }>("select number, total_minor, branch_id, status from requisitions where id = $1", [id]);
      if (!r || !["draft", "rejected"].includes(r.status)) fail("Only a draft or rejected requisition can be submitted.");
      await submitForApproval(db, { companyId: ctx.companyId, userId: ctx.user.id, kind: "purchase", subjectId: id, title: `${r!.number} (resubmitted)`, amountMinor: Number(r!.total_minor), branchId: r!.branch_id });
      await db.q("update requisitions set status = 'submitted' where id = $1", [id]);
    });
  });
}

export async function placeOrder(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/purchasing/${id}`, "/purchasing?tab=orders", "Purchase order created.", async () => {
    const po = await asUser(ctx.user.id, async (db) => {
      const r = await db.one<{ branch_id: string; supplier_id: string; total_minor: string }>("select branch_id, supplier_id, total_minor from requisitions where id = $1 and status = 'approved'", [id]);
      if (!r) fail("Only an approved requisition can be ordered.");
      const number = (await db.one<{ n: string }>("select app.next_number($1,'po','PO') n", [ctx.companyId]))!.n;
      const poId = (await db.one<{ id: string }>("insert into purchase_orders(company_id, branch_id, supplier_id, requisition_id, number, total_minor, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id", [ctx.companyId, r!.branch_id, r!.supplier_id, id, number, r!.total_minor, ctx.user.id]))!.id;
      await db.q("insert into po_lines(company_id, po_id, item_id, qty_ordered, unit_price_minor) select company_id, $2, item_id, qty, unit_price_minor from requisition_lines where requisition_id = $1", [id, poId]);
      return poId;
    });
    return `/purchasing/orders/${po}`;
  });
}

export async function receiveGoods(f: FormData) {
  const ctx = await requireCtx(); const po = uuid(f, "po_id"); const back = `/purchasing/orders/${po}`;
  return run(back, back, "Goods receipt recorded.", async () => {
    const entries = [...f.keys()].filter((k) => k.startsWith("recv:")).map((k) => { const id = k.slice(5); return { id, recv: Number(str(f, k) || "0"), rej: Number(str(f, `rej:${id}`) || "0"), note: str(f, `note:${id}`) }; }).filter((e) => e.recv > 0 || e.rej > 0);
    if (entries.length === 0) fail("Enter what arrived for at least one line.");
    if (entries.some((e) => !(e.recv >= 0) || !(e.rej >= 0))) fail("Quantities can't be negative.");
    await asUser(ctx.user.id, async (db) => {
      const gr = (await db.one<{ id: string }>("insert into goods_receipts(company_id, po_id, received_by, note) values ($1,$2,$3,$4) returning id", [ctx.companyId, po, ctx.user.id, str(f, "note")]))!.id;
      for (const e of entries) await db.q("insert into receipt_lines(company_id, receipt_id, po_line_id, qty_received, qty_rejected, discrepancy_note) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, gr, e.id, e.recv, e.rej, e.note || null]);
    });
  });
}

export async function cancelRequisition(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/purchasing/${id}`, "/purchasing", "Requisition cancelled.", async () => {
    const n = await asUser(ctx.user.id, (db) => db.q("update requisitions set status = 'cancelled' where id = $1 and status in ('draft','rejected') returning id", [id]));
    if (n.length === 0) fail("Only a draft or rejected requisition can be cancelled.");
  });
}

export async function saveRequisitionDraft(f: FormData) { return createReq(f, false); }
export async function submitNewRequisition(f: FormData) { return createReq(f, true); }
