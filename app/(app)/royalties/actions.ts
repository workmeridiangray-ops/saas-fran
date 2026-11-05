"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { allocatePayment, calculateRoyalty, ruleFor, type RoyaltyRule } from "@/lib/rules/royalty";
import { parseMinor } from "@/lib/rules/money";

const money = (f: FormData, k: string, label: string, allowNegative = false) => { const r = parseMinor(str(f, k) || "0"); if (!r.ok) return fail(`${label}: ${r.error}`); if (!allowNegative && r.value < 0) return fail(`${label} can't be negative.`); return r.value; };

export async function addRule(f: FormData) {
  const ctx = await requireCtx();
  return run("/royalties?tab=rules", "/royalties?tab=rules", "Royalty rule saved. Statements already issued are unaffected.", async () => {
    const type = str(f, "type"); if (!["fixed", "percent", "percent_with_minimum"].includes(type)) fail("Choose a rule type.");
    const rate = Math.round(Number(str(f, "rate") || "0") * 100); if (type !== "fixed" && !(rate > 0 && rate <= 10000)) fail("Enter a royalty rate between 0.01% and 100%.");
    const from = str(f, "from"), to = str(f, "to"); if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) fail("Set when the rule starts.");
    await asUser(ctx.user.id, async (db) => {
      const partner = str(f, "partner_id") || null;
      const v = Number((await db.one<{ v: string }>("select coalesce(max(version),0)+1 v from royalty_rules where company_id=$1 and partner_id is not distinct from $2::uuid", [ctx.companyId, partner]))!.v);
      await db.q("insert into royalty_rules(company_id, partner_id, version, type, rate_bp, fixed_minor, minimum_minor, effective_from, effective_to) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [ctx.companyId, partner, v, type, type === "fixed" ? null : rate, type === "fixed" ? money(f, "fixed", "Fixed fee") : null, type === "percent_with_minimum" ? money(f, "minimum", "Minimum") : null, from, to || null]);
    });
  });
}

export async function submitSales(f: FormData) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"); const month = str(f, "period");
  return run("/royalties?tab=sales", "/royalties?tab=sales", "Sales submitted.", async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) fail("Choose the month.");
    const gross = money(f, "gross", "Gross sales"), excl = money(f, "exclusions", "Exclusions"), adj = money(f, "adjustments", "Adjustments", true);
    await asUser(ctx.user.id, (db) => db.q("insert into sales_reports(company_id, branch_id, period, gross_minor, exclusions_minor, adjustments_minor, note, submitted_by) values ($1,$2,$3,$4,$5,$6,$7,$8)", [ctx.companyId, branch, `${month}-01`, gross, excl, adj, str(f, "note"), ctx.user.id]));
  });
}

export async function prepareStatement(f: FormData) {
  const ctx = await requireCtx(); const sale = uuid(f, "sales_id");
  return run("/royalties?tab=sales", "/royalties?tab=statements", "Statement drafted. Review it before it goes out.", async () => {
    const id = await asUser(ctx.user.id, async (db) => {
      const s = await db.one<{ branch_id: string; period: string; gross_minor: string; exclusions_minor: string; adjustments_minor: string; partner_id: string | null }>("select s.branch_id, s.period::text, s.gross_minor, s.exclusions_minor, s.adjustments_minor, b.partner_id from sales_reports s join branches b on b.id = s.branch_id where s.id = $1", [sale]);
      if (!s) fail("That sales report wasn't found."); if (!s!.partner_id) fail("This branch has no franchise partner, so no royalty applies.");
      const rows = await db.q<{ id: string; partner_id: string | null; version: number; type: RoyaltyRule["type"]; rate_bp: number | null; fixed_minor: string | null; minimum_minor: string | null; effective_from: string; effective_to: string | null }>(
        "select id, partner_id, version, type, rate_bp, fixed_minor::text, minimum_minor::text, effective_from::text, effective_to::text from royalty_rules where company_id = $1 and (partner_id = $2 or partner_id is null)", [ctx.companyId, s!.partner_id]);
      const toRule = (r: (typeof rows)[number]) => ({ id: r.id, version: r.version, effectiveFrom: r.effective_from, ...(r.effective_to && { effectiveTo: r.effective_to }), type: r.type, rateBp: r.rate_bp ?? 0, fixedMinor: Number(r.fixed_minor ?? 0), minimumMinor: Number(r.minimum_minor ?? 0) }) as RoyaltyRule;
      const periodEnd = new Date(Date.UTC(Number(s!.period.slice(0, 4)), Number(s!.period.slice(5, 7)), 0)).toISOString().slice(0, 10); // last day of the month
      let rule: RoyaltyRule;
      try { rule = ruleFor(rows.filter((r) => r.partner_id).map(toRule), periodEnd); }
      catch { try { rule = ruleFor(rows.filter((r) => !r.partner_id).map(toRule), periodEnd); } catch { return fail(`No royalty rule is effective for ${s!.period.slice(0, 7)}. Add one under Rules first.`); } }
      const calc = calculateRoyalty(rule, { grossSalesMinor: Number(s!.gross_minor), exclusionsMinor: Number(s!.exclusions_minor), adjustmentsMinor: Number(s!.adjustments_minor) });
      return (await db.one<{ id: string }>("insert into statements(company_id, partner_id, branch_id, period, rule_id, rule_version, base_minor, royalty_minor, minimum_applied, prepared_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
        [ctx.companyId, s!.partner_id, s!.branch_id, s!.period, calc.ruleId, calc.ruleVersion, calc.baseMinor, calc.royaltyMinor, calc.minimumApplied, ctx.user.id]))!.id;
    });
    return `/royalties/${id}`;
  });
}

export async function moveStatement(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const to = str(f, "to"); const reason = str(f, "reason"); const days = Number(str(f, "days") || "14");
  return run(`/royalties/${id}`, `/royalties/${id}`, { in_review: "Sent for review.", draft: "Sent back to draft.", approved: "Approved.", issued: "Issued to the partner.", void: "Voided." }[to] ?? "Updated.", async () => {
    if (to === "approved" && !ctx.has("approve", "royalties")) fail("You don't have permission to approve statements.");
    if (to === "issued" && !ctx.has("approve", "royalties")) fail("You don't have permission to issue statements.");
    await asUser(ctx.user.id, async (db) => {
      if (to === "issued") {
        if (!(days >= 1 && days <= 120)) fail("Payment terms must be between 1 and 120 days.");
        const number = (await db.one<{ n: string }>("select app.next_number($1,'royalty','ROY') n", [ctx.companyId]))!.n;
        await db.q("update statements set status = 'issued', number = $2, due_date = current_date + $3::int where id = $1", [id, number, days]);
      } else await db.q("update statements set status = $2, review_reason = coalesce(nullif($3,''), review_reason) where id = $1", [id, to, reason]);
    });
  });
}

export async function recordPayment(f: FormData) {
  const ctx = await requireCtx(); const partner = uuid(f, "partner_id");
  return run("/royalties?tab=payments", "/royalties?tab=payments", "Payment recorded and applied to the oldest statements first.", async () => {
    const amount = money(f, "amount", "Amount"); if (amount <= 0) fail("Enter the amount received.");
    const received = str(f, "received_on"); if (!/^\d{4}-\d{2}-\d{2}$/.test(received)) fail("Set the date received.");
    await asUser(ctx.user.id, async (db) => {
      const pay = (await db.one<{ id: string }>("insert into partner_payments(company_id, partner_id, amount_minor, received_on, reference, recorded_by) values ($1,$2,$3,$4,$5,$6) returning id", [ctx.companyId, partner, amount, received, str(f, "reference"), ctx.user.id]))!.id;
      const open = await db.q<{ id: string; due_date: string; outstanding: string }>("select s.id, s.due_date::text, app.statement_outstanding(s.id)::text outstanding from statements s where s.partner_id = $1 and s.status = 'issued'", [partner]);
      const { allocations } = allocatePayment("franchise_royalty", amount, open.map((o) => ({ id: o.id, kind: "franchise_royalty" as const, dueDate: o.due_date, outstandingMinor: Number(o.outstanding) })));
      for (const a of allocations) await db.q("insert into payment_allocations(company_id, payment_id, statement_id, amount_minor) values ($1,$2,$3,$4)", [ctx.companyId, pay, a.itemId, a.amountMinor]);
    });
  });
}
