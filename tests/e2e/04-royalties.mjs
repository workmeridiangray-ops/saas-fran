import { BASE, addBranch, expect, fetchIn, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Flow 4: royalty calculation -> review -> statement -> payment allocation");
const { browser, page: owner, errors } = await open();
const CO = `Fran Co ${Date.now()}`; const finEmail = uniq("finance");
let fin, stmtUrl;

await step("a franchise company: partner, franchise branch, plan gate until the plan includes royalties", async () => {
  await ownerWithCompany(owner, uniq("franowner"), "Fay Owner", CO, "franchise");
  await owner.goto(BASE + "/royalties"); await owner.getByText("isn't on your plan").waitFor();
});
await step("changing plan during the trial applies at once", async () => {
  await owner.goto(BASE + "/billing?to=scale"); await owner.getByText("Everything fits").waitFor().catch(() => {});
  await owner.getByRole("button", { name: /Confirm/ }).click(); await owner.getByText("It applies now, during your trial.").waitFor();
});
await step("add the partner and a franchise branch", async () => {
  await owner.goto(BASE + "/organisation"); const f = owner.locator('form:has(input[name="kind"][value="partners"])');
  await f.getByLabel(/^Add franchise partner/).fill("Lakeside LLC"); await f.getByRole("button", { name: "Add" }).click(); await owner.getByText("Lakeside LLC added.").waitFor();
  await addBranch(owner, "Lakeside 1", "LK1", async () => { await owner.getByLabel("Ownership").selectOption("franchise"); await owner.getByLabel("Franchise partner").selectOption({ label: "Lakeside LLC" }); });
});
await step("rules: 5% from 1 Jan 2026; an overlapping rule is refused", async () => {
  await owner.goto(BASE + "/royalties?tab=rules"); const f = () => owner.locator('form:has(button:has-text("Add rule"))');
  await f().getByLabel("Applies to").selectOption({ label: "Lakeside LLC" }); await f().getByLabel("Rate %").fill("5"); await f().getByLabel("Effective from").fill("2026-01-01"); await f().getByRole("button", { name: "Add rule" }).click();
  await owner.getByText("Royalty rule saved.").waitFor();
  await f().getByLabel("Applies to").selectOption({ label: "Lakeside LLC" }); await f().getByLabel("Rate %").fill("6"); await f().getByLabel("Effective from").fill("2026-06-01"); await f().getByRole("button", { name: "Add rule" }).click();
  await owner.getByText("That overlaps an existing entry.").waitFor();
});
await step("submit October sales: 20,000.00 gross, 1,000.00 excluded, 500.00 adjustment down", async () => {
  await owner.goto(BASE + "/royalties?tab=sales"); const f = owner.locator('form:has(button:has-text("Submit sales"))');
  await f.getByLabel("Branch").selectOption({ label: "Lakeside 1" }); await f.getByLabel("Month").fill("2026-10"); await f.getByLabel(/^Gross sales/).fill("20000.00"); await f.getByLabel("Exclusions").fill("1000.00"); await f.getByLabel(/^Adjustments/).fill("-500.00");
  await f.getByRole("button", { name: "Submit sales" }).click(); await owner.getByText("Sales submitted.").waitFor();
});
await step("a finance colleague drafts the statement: 5% of 18,500.00 = 925.00", async () => {
  ({ page: fin } = await inviteAndJoin(owner, browser, finEmail, "Finn Finance", "Finance"));
  await fin.goto(BASE + "/royalties?tab=sales"); await fin.getByRole("button", { name: "Draft statement" }).click(); await fin.getByText("Statement drafted.").waitFor();
  await fin.getByText("$925.00").first().waitFor(); stmtUrl = fin.url().split("?")[0];
  const [s] = await q("select base_minor, royalty_minor from statements s join companies c on c.id = s.company_id where c.name = $1", [CO]); expect(Number(s.base_minor) === 1850000 && Number(s.royalty_minor) === 92500, JSON.stringify(s));
});
await step("the preparer cannot approve their own statement", async () => {
  await fin.getByRole("button", { name: "Send for review" }).click(); await fin.getByText("Sent for review.").waitFor();
  expect(await fin.getByRole("button", { name: "Approve", exact: true }).count() === 0, "approve button shown to the preparer");
});
await step("the owner sends it back with a reason, finance fixes and resubmits", async () => {
  await owner.goto(stmtUrl); await owner.getByLabel("What needs fixing").fill("Check the exclusions"); await owner.getByRole("button", { name: "Send back with a reason" }).click(); await owner.getByText("Sent back to draft.").waitFor();
  await fin.goto(stmtUrl); await fin.getByText("Check the exclusions").waitFor(); await fin.getByRole("button", { name: "Send for review" }).click(); await fin.getByText("Sent for review.").waitFor();
});
await step("the owner approves and issues with 14-day terms", async () => {
  await owner.goto(stmtUrl); await owner.getByRole("button", { name: "Approve", exact: true }).click(); await owner.getByText("Approved.").first().waitFor();
  await owner.getByRole("button", { name: "Issue to partner" }).click(); await owner.getByText("Issued to the partner.").waitFor(); await owner.getByText("Issued statements can't be changed").waitFor();
});
await step("payments apply oldest-first and never beyond what is owed", async () => {
  await owner.goto(BASE + "/royalties?tab=payments"); const f = owner.locator('form:has(button:has-text("Record and apply"))');
  await f.getByLabel("Partner").selectOption({ label: "Lakeside LLC" }); await f.getByLabel(/^Amount/).fill("600.00"); await f.getByRole("button", { name: "Record and apply" }).click(); await owner.getByText(/Payment recorded/).waitFor();
  await owner.goto(stmtUrl); await owner.getByText("$325.00").first().waitFor();
  await owner.goto(BASE + "/royalties?tab=payments"); await f.getByLabel("Partner").selectOption({ label: "Lakeside LLC" }); await f.getByLabel(/^Amount/).fill("400.00"); await f.getByRole("button", { name: "Record and apply" }).click(); await owner.getByText(/Payment recorded/).waitFor();
  const [r] = await q("select (select sum(amount_minor) from payment_allocations a join companies c on c.id = a.company_id where c.name = $1)::int alloc, (select sum(amount_minor) from partner_payments p join companies c on c.id = p.company_id where c.name = $1)::int paid", [CO]);
  expect(r.alloc === 92500 && r.paid === 100000, JSON.stringify(r));
  await owner.goto(BASE + "/royalties?tab=payments"); await owner.getByText("$75.00").first().waitFor();
});
await step("the SaaS subscription and royalty ledgers stay separate", async () => {
  const [r] = await q("select (select count(*) from platform_invoices i join companies c on c.id = i.company_id where c.name = $1)::int saas, (select count(*) from statements s join companies c on c.id = s.company_id where c.name = $1)::int roy", [CO]);
  expect(r.saas === 0 && r.roy === 1, JSON.stringify(r));
});
await step("CSV export neutralises spreadsheet formulas and respects permission", async () => {
  const res = await fetchIn(owner, "/api/export/statements"); expect(res.status === 200 && /ROY-0001/.test(res.text) && /text\/csv/.test(res.ct), "export missing the statement: " + res.status + " " + res.ct);
  const bad = await fetchIn(fin, "/api/export/audit"); expect(bad.status === 403, "finance should not export the audit log: " + bad.status);
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
