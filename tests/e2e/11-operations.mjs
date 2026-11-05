import { BASE, addBranch, expect, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Regional scope, SLA escalation, stock ledger, opening projects");
const { browser, page: owner, errors } = await open();
const CO = `Ops Co ${Date.now()}`; const mgrEmail = uniq("regmgr"); let mgr, southId, s, annexId; const STK = `Stock Co ${Date.now()}`;
const cron = () => fetch(BASE + "/api/cron/renewals", { method: "POST", headers: { Authorization: "Bearer test-cron-secret-0123456789" } }).then((r) => r.json());

await step("regions North and South with a branch each", async () => {
  await ownerWithCompany(owner, uniq("opsowner"), "Ola Owner", CO);
  await owner.goto(BASE + "/organisation"); const f = owner.locator('form:has(input[name="kind"][value="regions"])');
  for (const r of ["North", "South"]) { await f.getByLabel(/^Add region/).fill(r); await f.getByRole("button", { name: "Add" }).click(); await owner.getByText(`${r} added.`).waitFor(); }
  await addBranch(owner, "North Store", "NS1", async () => { await owner.getByLabel("Region").selectOption({ label: "North" }); });
  southId = await addBranch(owner, "South Store", "SS1", async () => { await owner.getByLabel("Region").selectOption({ label: "South" }); });
});
await step("a regional manager invited with a region scope sees only that region", async () => {
  await owner.goto(BASE + "/people"); await owner.getByLabel("Email").fill(mgrEmail); await owner.locator('form:has(button:has-text("Send invitation"))').getByLabel("Role").selectOption({ label: "Branch manager" });
  await owner.locator('form:has(button:has-text("Send invitation"))').getByLabel("North", { exact: true }).check(); await owner.getByRole("button", { name: "Send invitation" }).click(); await owner.getByText(/Invitation sent/).waitFor();
  ({ page: mgr } = await inviteAndJoinExisting());
  await mgr.goto(BASE + "/branches"); await mgr.getByRole("link", { name: "North Store" }).waitFor(); expect(await mgr.getByRole("link", { name: "South Store" }).count() === 0, "saw the other region");
  const r = await mgr.goto(BASE + "/branches/" + southId); expect(r.status() === 404, "opened a branch in another region: " + r.status());
});
await step("the People screen shows the scope in words", async () => { await owner.goto(BASE + "/people"); await owner.getByText("Region North").waitFor(); });
await step("an urgent ticket past its deadline escalates once, to the owner", async () => {
  await owner.goto(BASE + "/tickets/new"); await owner.getByLabel("Type").selectOption({ label: "Incident / safety" }).catch(() => {}); await owner.getByLabel("Priority").selectOption("urgent"); await owner.getByLabel("Title").fill("Gas smell in kitchen"); await owner.getByRole("button", { name: "Raise ticket" }).click(); await owner.getByText("Ticket raised.").waitFor();
  const [t] = await q("select (t.due_at - t.created_at) = interval '4 hours' ok from tickets t join companies c on c.id = t.company_id where c.name = $1", [CO]); expect(t.ok, "urgent ticket didn't get the 4 hour default");
  await q("update tickets set due_at = now() - interval '1 hour' where company_id = (select id from companies where name = $1)", [CO]); await cron();
  await owner.goto(BASE + "/tickets"); await owner.getByText("Late, escalated").waitFor(); const again = await cron(); expect(again.escalations === 0, "escalated twice: " + JSON.stringify(again));
});
await step("SLA hours are configurable", async () => {
  await owner.goto(BASE + "/tickets?tab=sla"); await owner.getByLabel("Urgent").fill("2"); await owner.getByRole("button", { name: "Save deadlines" }).click(); await owner.getByText(/Response deadlines saved/).waitFor();
  expect((await q("select resolve_hours from sla_policies s join companies c on c.id = s.company_id where c.name = $1 and priority = 'urgent'", [CO]))[0].resolve_hours === 2, "not saved");
});
await step("goods received against an order land in stock", async () => {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } }); s = await c2.newPage(); await ownerWithCompany(s, uniq("stockowner"), "Stu Owner", STK); await addBranch(s, "Main", "MN1"); annexId = await addBranch(s, "Annex", "AN1");
  await s.goto(BASE + "/purchasing?tab=suppliers"); await s.getByLabel(/^Name/).first().fill("BeanCo"); await s.getByRole("button", { name: "Add supplier" }).click(); await s.getByText("BeanCo added.").waitFor();
  await s.getByLabel("Code").fill("BEAN"); await s.getByLabel("Item name").fill("Coffee beans (kg)"); await s.getByLabel(/^Price/).fill("12.50"); await s.getByRole("button", { name: "Add item" }).click(); await s.getByText("Item added to the catalogue.").waitFor();
  await s.goto(BASE + "/purchasing/new"); await s.getByLabel("Supplier").selectOption({ label: "BeanCo" }); await s.getByRole("button", { name: "Show items" }).click(); await s.getByLabel("Deliver to branch").selectOption({ label: "Annex" });
  await s.locator('input[name^="qty:"]').first().fill("20"); await s.getByRole("button", { name: "Submit for approval" }).click(); await s.getByRole("heading", { name: /REQ-0001/ }).waitFor();
  await s.goto(BASE + "/approvals"); await s.getByRole("button", { name: "Approve", exact: true }).click(); await s.getByText("Decision recorded: approved.").waitFor();
  await s.goto(BASE + "/purchasing"); await s.getByRole("link", { name: "REQ-0001" }).click(); await s.getByRole("button", { name: "Place order" }).click(); await s.getByRole("heading", { name: /PO-0001/ }).waitFor();
  await s.getByLabel("Arrived now: Coffee beans (kg)").fill("20"); await s.getByRole("button", { name: "Record receipt" }).click(); await s.getByText("Goods receipt recorded.").waitFor();
  await s.goto(BASE + "/stock?branch=" + annexId); await s.getByRole("cell", { name: /^20 / }).waitFor();
});
await step("stock use, wastage, transfers and counts follow the rules", async () => {
  const sel = (n) => s.locator(`form:has(button:has-text("${n}"))`);
  let f = sel("Record use or wastage".split(" ")[0] === "Record" ? "Record" : "Record"); // first form with a Record button
  f = s.locator('form:has(select[name="kind"])'); await f.getByLabel("Branch").selectOption({ label: "Annex" }); await f.getByLabel("Item").selectOption({ index: 0 }); await f.getByLabel("Quantity").fill("25"); await f.getByRole("button", { name: "Record" }).click(); await s.getByText(/not enough stock: 20(\.000)? on hand, 25(\.000)? requested/).waitFor();
  await f.getByLabel("Branch").selectOption({ label: "Annex" }); await f.getByLabel("Quantity").fill("3"); await f.getByLabel("Type").selectOption("wastage"); await f.getByRole("button", { name: "Record" }).click(); await s.getByText(/Say why it was wasted/).waitFor();
  await f.getByLabel("Branch").selectOption({ label: "Annex" }); await f.getByLabel("Quantity").fill("3"); await f.getByLabel("Type").selectOption("wastage"); await f.getByLabel(/^Note/).fill("Dropped sack"); await f.getByRole("button", { name: "Record" }).click(); await s.getByText("Wastage recorded.").waitFor();
  const t = s.locator('form:has(button:has-text("Transfer"))'); await t.getByLabel("From").selectOption({ label: "Annex" }); await t.getByLabel("To").selectOption({ label: "Main" }); await t.getByLabel("Quantity").fill("7"); await t.getByRole("button", { name: "Transfer" }).click(); await s.getByText("Stock transferred.").waitFor();
  const lv = async () => (await q("select b.code, l.qty::float qty from stock_levels l join branches b on b.id = l.branch_id join companies c on c.id = l.company_id where c.name = $1 order by b.code", [STK])).map((r) => r.code + ":" + r.qty).join(" "); expect(await lv() === "AN1:10 MN1:7", await lv());
  const c = s.locator('form:has(button:has-text("Record count"))'); await c.getByLabel("Branch").selectOption({ label: "Annex" }); await c.getByLabel(/^Quantity counted/).fill("9"); await c.getByRole("button", { name: "Record count" }).click(); await s.getByText(/One of the values isn't allowed|Count recorded/).waitFor();
  await c.getByLabel("Branch").selectOption({ label: "Annex" }); await c.getByLabel(/^Quantity counted/).fill("9"); await c.getByLabel(/^Reason/).fill("One bag split"); await c.getByRole("button", { name: "Record count" }).click(); await s.getByText(/Count recorded/).waitFor();
  expect(await lv() === "AN1:9 MN1:7", await lv());
});
await step("a reorder point raises an alert on the command centre", async () => {
  const r = s.locator('form:has(button:has-text("Save"))').last(); await r.getByLabel("Branch").selectOption({ label: "Annex" }); await r.getByLabel(/^Warn when/).fill("12"); await r.getByRole("button", { name: "Save" }).click(); await s.getByText("Reorder point saved.").waitFor();
  await s.goto(BASE + "/stock"); await s.getByText("Reorder now").first().waitFor(); await s.goto(BASE + "/"); await s.getByText(/at or below its reorder point/).waitFor();
});
await step("the ledger can't be rewritten", async () => { let blocked = false; try { await q("update stock_movements set qty = 999 where company_id = (select id from companies where name = $1)", [STK]); } catch { blocked = true; } expect(blocked, "a movement was edited"); });
await step("an opening project starts from the restaurant template and can't launch half-done", async () => {
  await addBranch(owner, "Riverside", "RV1", async () => { await owner.getByLabel("Status").selectOption("opening"); });
  await owner.goto(BASE + "/projects/new"); await owner.getByLabel("Project name").fill("Open Riverside"); await owner.getByLabel("Branch being opened").selectOption({ label: "Riverside" }); await owner.getByLabel(/^Budget/).fill("50000"); await owner.getByRole("button", { name: "Create project" }).click();
  await owner.getByRole("heading", { name: "Open Riverside" }).waitFor(); await owner.getByText("Not ready to launch").waitFor(); await owner.getByText(/Food business registration/).waitFor();
  expect(await owner.getByRole("button", { name: "Approve and launch" }).count() === 0, "launch offered too early");
});
await step("evidence is required where the template says so; blockers stop launch; finishing everything opens the branch", async () => {
  const [{ id: pid }] = await q("select p.id from projects p join companies c on c.id = p.company_id where c.name = $1", [CO]);
  await q("update project_items set status = 'done', evidence_note = 'on file' where project_id = $1 and title <> 'Food business registration'", [pid]);
  await owner.goto(BASE + "/projects/" + pid); const row = owner.locator("details", { hasText: "Food business registration" }); await row.locator("summary").click();
  await row.getByLabel("Status").selectOption("done"); await row.getByRole("button", { name: "Save item" }).click(); await owner.getByText(/One of the values isn't allowed/).waitFor();
  await owner.locator("details", { hasText: "Food business registration" }).locator("summary").click(); const r2 = owner.locator("details", { hasText: "Food business registration" }); await r2.getByLabel("Status").selectOption("blocked"); await r2.getByLabel(/^If blocked/).fill("Waiting for the council"); await r2.getByRole("button", { name: "Save item" }).click(); await owner.getByText("Item updated.").waitFor(); await owner.getByText(/1 item is blocked/).waitFor();
  const r3 = owner.locator("details", { hasText: "Food business registration" }); await r3.locator("summary").click(); await r3.getByLabel("Status").selectOption("done"); await r3.getByLabel(/^Evidence/).fill("Registration no. 88213"); await r3.getByLabel(/^Cost/).fill("350"); await r3.getByRole("button", { name: "Save item" }).click(); await owner.getByText("Item updated.").waitFor();
  await owner.getByText("100%").first().waitFor(); await owner.getByRole("button", { name: "Approve and launch" }).click(); await owner.getByText(/Launched\. The branch is now active/).waitFor();
  expect((await q("select b.status from branches b join companies c on c.id = b.company_id where c.name = $1 and b.code = 'RV1'", [CO]))[0].status === "active", "branch not opened");
});
await step("a launched project is a record: no more edits, and a review can be written", async () => {
  expect(await owner.getByRole("button", { name: "Save item" }).count() === 0, "edit forms still shown after launch");
  await owner.getByLabel(/^What went well/).fill("Licence took the longest; apply earlier next time."); await owner.getByRole("button", { name: "Save review" }).click(); await owner.getByText("Post-launch review saved.").waitFor();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);

async function inviteAndJoinExisting() {
  const { lastMailLink, newUser, PW } = await import("./helpers.mjs");
  const url = await lastMailLink(mgrEmail, /http\S+\/invite\/\S+/); const { page } = await newUser(browser);
  await page.goto(url); await page.getByRole("link", { name: "Create account" }).click(); await page.getByLabel("Your name").fill("Rae Regional"); await page.getByLabel("Work email").fill(mgrEmail); await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click(); await page.waitForURL(/verify/); await page.goto(await lastMailLink(mgrEmail, /http\S+verify\S+/)); await page.getByRole("button", { name: "Confirm my email" }).click(); await page.waitForURL(/signin/);
  await page.getByLabel("Email").fill(mgrEmail); await page.getByLabel("Password").fill(PW); await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForURL(/invite/); await page.getByRole("button", { name: "Accept and open workspace" }).click(); await page.waitForURL((u) => u.pathname === "/");
  return { page };
}
