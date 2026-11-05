"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { agreementProblem, canMove, type Stage } from "@/lib/rules/franchise";
import { parseMinor } from "@/lib/rules/money";

const dt = (f: FormData, k: string) => { const v = str(f, k); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; };
const money = (f: FormData, k: string, label: string) => { const v = str(f, k); if (!v) return 0; const r = parseMinor(v); if (!r.ok) return fail(`${label}: ${r.error}`); if (r.value < 0) return fail(`${label} can't be negative.`); return r.value; };

export async function createApplicant(f: FormData) {
  const ctx = await requireCtx();
  return run("/franchise/new", "/franchise", "Applicant added to the pipeline.", async () => {
    const name = str(f, "name"); if (name.length < 2) fail("Enter the applicant's name.");
    const id = await asUser(ctx.user.id, async (db) => (await db.one<{ id: string }>("insert into applicants(company_id, name, email, phone, source, notes, owner_id) values ($1,$2,nullif($3,''),$4,$5,$6,$7) returning id", [ctx.companyId, name, str(f, "email"), str(f, "phone"), str(f, "source") || "manual", str(f, "notes"), ctx.user.id]))!.id);
    return `/franchise/${id}`;
  });
}
export async function moveApplicant(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const to = str(f, "to") as Stage;
  return run(`/franchise/${id}`, `/franchise/${id}`, "Stage updated.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const a = await db.one<{ stage: Stage }>("select stage from applicants where id = $1 for update", [id]); if (!a) fail("That applicant wasn't found.");
      if (!canMove(a!.stage, to)) fail(`An application at “${a!.stage}” can't move to “${to}”.`);
      if (to === "qualified" || to === "meeting") { /* no preconditions */ }
      await db.q("update applicants set stage = $2 where id = $1", [id, to]);
    });
  });
}
export async function addCheck(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const kind = str(f, "kind") === "document" ? "document" : "qualification";
  return run(`/franchise/${id}`, `/franchise/${id}`, "Check added.", async () => {
    const label = str(f, "label"); if (label.length < 2) fail("Name the check.");
    await asUser(ctx.user.id, (db) => db.q("insert into applicant_checks(company_id, applicant_id, kind, label) values ($1,$2,$3,$4)", [ctx.companyId, id, kind, label]));
  });
}
export async function setCheck(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), applicant = uuid(f, "applicant_id"); const status = str(f, "status");
  return run(`/franchise/${applicant}`, `/franchise/${applicant}`, "Check updated.", async () => {
    if (!["open", "received", "verified", "rejected"].includes(status)) fail("Unknown status.");
    await asUser(ctx.user.id, (db) => db.q("update applicant_checks set status = $2, note = nullif($3,'') where id = $1", [id, status, str(f, "note")]));
  });
}
export async function reserve(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), territory = uuid(f, "territory_id"); const days = Number(str(f, "days") || "30");
  return run(`/franchise/${id}`, `/franchise/${id}`, "Territory reserved.", async () => { await asUser(ctx.user.id, (db) => db.q("select public.reserve_territory($1,$2,$3)", [territory, id, days])); });
}
export async function saveProposal(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/franchise/${id}`, `/franchise/${id}`, "Proposal saved.", async () => { const fee = money(f, "fee", "Franchise fee"); await asUser(ctx.user.id, (db) => db.q("update applicants set proposal_fee_minor = $2, proposal_note = $3 where id = $1", [id, fee, str(f, "note")])); });
}
async function decide(f: FormData, outcome: "approved" | "rejected" | "withdrawn") {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const reason = str(f, "reason");
  return run(`/franchise/${id}`, `/franchise/${id}`, outcome === "approved" ? "Approved. The applicant is now an approved partner, awaiting an agreement." : outcome === "rejected" ? "Application rejected." : "Application withdrawn.", async () => {
    await asUser(ctx.user.id, async (db) => { if (outcome === "approved") await db.q("select public.approve_applicant($1)", [id]); else await db.q("select public.decide_applicant($1,$2,$3)", [id, outcome, reason]); });
  });
}
export async function approveApplicant(f: FormData) { return decide(f, "approved"); }
export async function rejectApplicant(f: FormData) { return decide(f, "rejected"); }
export async function withdrawApplicant(f: FormData) { return decide(f, "withdrawn"); }

export async function addTerritory(f: FormData) {
  const ctx = await requireCtx();
  return run("/franchise?tab=territories", "/franchise?tab=territories", "Territory added.", async () => {
    const name = str(f, "name"); if (name.length < 2) fail("Name the territory.");
    await asUser(ctx.user.id, (db) => db.q("insert into territories(company_id, name, region_id, notes) values ($1,$2,nullif($3,'')::uuid,$4)", [ctx.companyId, name, str(f, "region_id"), str(f, "notes")]));
  });
}
export async function createAgreement(f: FormData) {
  const ctx = await requireCtx(); const applicant = uuid(f, "applicant_id");
  return run(`/franchise/${applicant}`, "/franchise?tab=agreements", "Agreement drafted with its fee schedule.", async () => {
    const start = dt(f, "start"), end = dt(f, "end"), remind = Number(str(f, "reminder") || "90"); const p = agreementProblem({ start, end, reminderDays: remind }); if (p) fail(p);
    const fee = money(f, "fee", "Franchise fee"), dep = money(f, "deposit", "Deposit");
    const id = await asUser(ctx.user.id, async (db) => {
      const a = await db.one<{ partner_id: string | null; territory_id: string | null; stage: string }>("select partner_id, territory_id, stage from applicants where id = $1", [applicant]);
      if (!a || a.stage !== "approved" || !a.partner_id || !a.territory_id) fail("Approve the applicant and reserve a territory first.");
      const number = (await db.one<{ n: string }>("select app.next_number($1,'agreement','AGR') n", [ctx.companyId]))!.n;
      const gid = (await db.one<{ id: string }>("insert into agreements(company_id, number, partner_id, applicant_id, territory_id, start_date, end_date, reminder_days, franchise_fee_minor, deposit_minor, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id", [ctx.companyId, number, a!.partner_id, applicant, a!.territory_id, start, end, remind, fee, dep, ctx.user.id]))!.id;
      if (fee > 0) await db.q("insert into agreement_fees(company_id, agreement_id, kind, due_on, amount_minor) values ($1,$2,'franchise_fee',$3,$4)", [ctx.companyId, gid, start, fee]);
      if (dep > 0) await db.q("insert into agreement_fees(company_id, agreement_id, kind, due_on, amount_minor) values ($1,$2,'deposit',$3,$4)", [ctx.companyId, gid, start, dep]);
      return gid;
    });
    return `/franchise/agreements/${id}`;
  });
}
const back = (id: string) => `/franchise/agreements/${id}`;
export async function sendAgreementForReview(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(back(id), back(id), "Sent for review.", async () => { const n = await asUser(ctx.user.id, (db) => db.q("update agreements set status = 'in_review' where id = $1 and status = 'draft' returning id", [id])); if (!n.length) fail("Only a draft can be sent for review."); });
}
export async function signAgreement(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(back(id), back(id), "Signed. The partner is active once the agreement starts.", async () => { await asUser(ctx.user.id, (db) => db.q("select public.sign_agreement($1)", [id])); });
}
export async function renewAgreement(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const end = dt(f, "end");
  return run(back(id), back(id), "Renewal drafted as the next version.", async () => { if (!end) fail("Set the new end date."); const nid = await asUser(ctx.user.id, async (db) => (await db.one<{ r: string }>("select public.renew_agreement($1,$2) r", [id, end]))!.r); return back(nid); });
}
export async function terminateAgreement(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(back(id), back(id), "Agreement terminated. Review the partner's branches below.", async () => { await asUser(ctx.user.id, (db) => db.q("select public.terminate_agreement($1,$2)", [id, str(f, "reason")])); });
}
export async function transferAgreement(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), to = uuid(f, "partner_id");
  return run(back(id), back(id), "Ownership transferred. The partner's branches moved with it.", async () => { await asUser(ctx.user.id, (db) => db.q("select public.transfer_ownership($1,$2,$3)", [id, to, str(f, "reason")])); });
}
async function settle(f: FormData, as: "paid" | "waived") {
  const ctx = await requireCtx(); const id = uuid(f, "id"), agreement = uuid(f, "agreement_id");
  return run(back(agreement), back(agreement), as === "paid" ? "Fee recorded as paid." : "Fee waived.", async () => {
    if (as === "waived" && str(f, "note").length < 3) fail("Say why it is waived.");
    await asUser(ctx.user.id, (db) => db.q("update agreement_fees set status = $2, paid_on = case when $2 = 'paid' then coalesce(nullif($3,'')::date, current_date) end, note = nullif($4,'') where id = $1 and status = 'due'", [id, as, dt(f, "paid_on"), str(f, "note")]));
  });
}

export async function markFeePaid(f: FormData) { return settle(f, "paid"); }
export async function waiveFee(f: FormData) { return settle(f, "waived"); }
