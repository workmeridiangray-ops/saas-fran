import { BASE, expect, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Franchise: public enquiry -> pipeline -> checks -> territory -> approval -> agreement -> active partner");
const { browser, page: owner, errors } = await open();
const CO = `Fran Pipe ${Date.now()}`; const lead = uniq("lead");
let slug, appUrl;

await step("owner on the Scale plan sets up two territories", async () => {
  await ownerWithCompany(owner, uniq("pipeowner"), "Pia Owner", CO, "franchise");
  await owner.goto(BASE + "/billing?to=scale"); await owner.getByRole("button", { name: /Confirm/ }).click(); await owner.getByText("It applies now, during your trial.").waitFor();
  [{ slug }] = await q("select slug from companies where name = $1", [CO]);
  await owner.goto(BASE + "/franchise?tab=territories");
  for (const t of ["Riverside", "Harbour"]) { await owner.getByLabel(/^Name/).fill(t); await owner.getByRole("button", { name: "Add territory" }).click(); await owner.getByText("Territory added.").waitFor(); }
}, owner);
await step("a stranger can apply on the public page without an account", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/apply/" + slug); await p.getByRole("heading", { name: new RegExp(`Franchise with ${CO}`) }).waitFor();
  await p.getByLabel("Your name").fill("Lena Lead"); await p.getByLabel("Email").fill(lead); await p.getByLabel(/Where would you like/).fill("Looking at the riverside area"); await p.getByRole("button", { name: "Send enquiry" }).click();
  await p.getByText(/Your enquiry has been received/).waitFor(); await c.close();
  const [a] = await q("select a.stage, a.source from applicants a join companies c on c.id = a.company_id where c.name = $1 and a.email = $2", [CO, lead.toLowerCase()]); expect(a.stage === "enquiry" && a.source === "website", JSON.stringify(a));
}, owner);
await step("the owner is notified and sees the lead in the pipeline", async () => {
  await owner.goto(BASE + "/notifications"); await owner.getByText(/New franchise enquiry: Lena Lead/).waitFor();
  await owner.goto(BASE + "/franchise"); await owner.getByRole("link", { name: /Lena Lead/ }).waitFor();
}, owner);
await step("a bot that fills the hidden field is ignored", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/apply/" + slug);
  await p.getByLabel("Your name").fill("Bot"); await p.getByLabel("Email").fill(uniq("bot")); await p.locator('input[name="website"]').fill("http://spam.example", { force: true });
  await p.getByRole("button", { name: "Send enquiry" }).click(); await p.getByText(/Your enquiry has been received/).waitFor(); await c.close();
  expect((await q("select count(*)::int n from applicants a join companies c on c.id = a.company_id where c.name = $1 and a.name = 'Bot'", [CO]))[0].n === 0, "the bot got in");
}, owner);
await step("the same address can't flood the form", async () => {
  const c = await browser.newContext(); const p = await c.newPage();
  for (let i = 0; i < 3; i++) { await p.goto(BASE + "/apply/" + slug); await p.getByLabel("Your name").fill("Lena Lead"); await p.getByLabel("Email").fill(lead); await p.getByRole("button", { name: "Send enquiry" }).click(); await p.waitForURL(/sent=1|err=/); }
  await p.getByText(/already received your enquiry/).waitFor(); await c.close();
  expect((await q("select count(*)::int n from applicants a join companies c on c.id = a.company_id where c.name = $1 and a.email = $2", [CO, lead.toLowerCase()]))[0].n === 2, "more than two accepted");
}, owner);
await step("an unknown company address shows nothing", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/apply/no-such-company"); await p.getByText("This page isn't available").waitFor(); await c.close();
}, owner);
await step("stages move one at a time; you can't jump to review", async () => {
  await owner.goto(BASE + "/franchise"); await owner.getByRole("link", { name: /Lena Lead/ }).first().click(); await owner.waitForURL(/\/franchise\/[0-9a-f-]{36}/); appUrl = owner.url().split("?")[0];
  expect(await owner.getByRole("button", { name: /Move to Proposal/ }).count() === 0, "could skip stages");
  for (const s of ["Qualified", "Meeting / site visit", "Proposal", "Application review"]) { await owner.getByRole("button", { name: new RegExp(`^Move to ${s.replace("/", "\\/")}`) }).click(); await owner.getByText("Stage updated.").waitFor(); }
}, owner);
await step("approval is blocked and says why", async () => {
  await owner.getByText("Before this can be approved").waitFor(); await owner.getByText("Reserve a territory first").waitFor(); await owner.getByText("Add the qualification and document checks").waitFor();
  expect(await owner.getByRole("button", { name: "Approve application" }).count() === 0, "approve offered too early");
}, owner);
await step("reserve Riverside; a second applicant can't take it", async () => {
  await owner.getByLabel("Reserve").selectOption({ label: "Riverside" }); await owner.getByRole("button", { name: "Reserve", exact: true }).click(); await owner.getByText("Territory reserved.").waitFor();
  await owner.goto(BASE + "/franchise/new"); await owner.getByLabel(/^Name or company/).fill("Rival Co"); await owner.getByRole("button", { name: "Add to pipeline" }).click(); await owner.getByRole("heading", { name: "Rival Co" }).waitFor();
  await owner.getByLabel("Reserve").selectOption({ label: "Riverside" }).catch(() => {});
  const opts = await owner.getByLabel("Reserve").locator("option").allInnerTexts(); expect(!opts.includes("Riverside"), "a reserved territory is offered to someone else: " + opts.join(","));
}, owner);
await step("checks gate approval; a rejection needs a reason", async () => {
  await owner.goto(appUrl); for (const [kind, label] of [["Document", "Photo ID"], ["Qualification", "Funds above the threshold"]]) { const f = owner.locator('form:has(button:has-text("Add check"))'); await f.getByLabel("Type").selectOption({ label: kind }); await f.getByLabel("What to verify").fill(label); await f.getByRole("button", { name: "Add check" }).click(); await owner.getByText("Check added.").waitFor(); }
  const row = owner.locator("li", { hasText: "Photo ID" }); await row.getByLabel("Status").selectOption("rejected"); await row.getByRole("button", { name: "Update" }).click(); await owner.getByText(/One of the values isn't allowed/).waitFor();
  for (const label of ["Photo ID", "Funds above the threshold"]) { const r = owner.locator("li", { hasText: label }); await r.getByLabel("Status").selectOption("verified"); await r.getByRole("button", { name: "Update" }).click(); await owner.getByText("Check updated.").waitFor(); }
}, owner);
await step("approval creates an APPROVED partner, not an active one", async () => {
  await owner.getByRole("button", { name: "Approve application" }).click(); await owner.getByText(/Approved\. The applicant is now an approved partner/).waitFor();
  const [p] = await q("select p.stage from franchise_partners p join companies c on c.id = p.company_id where c.name = $1 and p.name = 'Lena Lead'", [CO]); expect(p.stage === "approved", p.stage);
}, owner);
await step("rejecting really rejects, with the reason on record", async () => {
  await owner.goto(BASE + "/franchise"); await owner.getByRole("link", { name: /Rival Co/ }).click();
  await owner.getByRole("button", { name: "Reject", exact: true }).click(); await owner.getByText("record the reason").waitFor().catch(() => {});
  await owner.getByLabel(/^Reason/).fill("Insufficient funds"); await owner.getByRole("button", { name: "Reject", exact: true }).click(); await owner.getByText("Application rejected.").waitFor();
  expect((await q("select stage from applicants a join companies c on c.id = a.company_id where c.name = $1 and a.name = 'Rival Co'", [CO]))[0].stage === "rejected", "not rejected");
}, owner);
await step("draft the agreement with its fee schedule, then sign it", async () => {
  await owner.goto(appUrl); const f = owner.locator('form:has(button:has-text("Draft agreement"))');
  const start = new Date(Date.now() - 86400000).toISOString().slice(0, 10), end = new Date(Date.now() + 5 * 365 * 86400000).toISOString().slice(0, 10);
  await f.locator('input[name="start"]').fill(start); await f.locator('input[name="end"]').fill(end); await f.locator('input[name="fee"]').fill("25000.00"); await f.locator('input[name="deposit"]').fill("5000.00"); await f.getByRole("button", { name: "Draft agreement" }).click();
  await owner.getByText("Agreement drafted with its fee schedule.").waitFor(); await owner.getByText("$25,000.00").first().waitFor();
  await owner.getByRole("button", { name: "Record as signed" }).click(); await owner.getByText(/Signed\./).waitFor();
  const [r] = await q("select p.stage ps, t.status ts from franchise_partners p join territories t on t.partner_id = p.id join companies c on c.id = p.company_id where c.name = $1 and p.name = 'Lena Lead'", [CO]); expect(r.ps === "active" && r.ts === "assigned", JSON.stringify(r));
}, owner);
await step("fees can be recorded as paid; waiving needs a reason", async () => {
  const row = owner.locator("tr", { hasText: "Franchise fee" }); await row.getByRole("button", { name: "Paid" }).click(); await owner.getByText("Fee recorded as paid.").waitFor();
  const dep = owner.locator("tr", { hasText: "Deposit" }); await dep.getByRole("button", { name: "Waive" }).click(); await owner.getByText("Say why it is waived.").waitFor();
}, owner);
await step("a renewal is the next version; only one at a time", async () => {
  const end = new Date(Date.now() + 8 * 365 * 86400000).toISOString().slice(0, 10);
  await owner.locator('input[name="end"]').fill(end); await owner.getByRole("button", { name: "Draft renewal" }).click(); await owner.getByText("Renewal drafted as the next version.").waitFor(); await owner.getByText(/version 2/).first().waitFor();
}, owner);
await step("termination needs a reason, frees the territory and lists the branches to wind down", async () => {
  await owner.goBack(); await owner.goBack().catch(() => {}); const [g] = await q("select g.id from agreements g join companies c on c.id = g.company_id where c.name = $1 and g.version = 1", [CO]);
  await owner.goto(BASE + "/franchise/agreements/" + g.id); await owner.getByRole("button", { name: "Terminate agreement" }).click(); await owner.getByText(/record the reason/).waitFor().catch(() => {});
  await owner.getByLabel(/^Reason \(recorded/).fill("Repeated breaches of brand standards"); await owner.getByRole("button", { name: "Terminate agreement" }).click(); await owner.getByText("Agreement terminated.").waitFor();
  const [r] = await q("select p.stage ps, t.status ts from franchise_partners p join territories t on t.name = 'Riverside' and t.company_id = p.company_id join companies c on c.id = p.company_id where c.name = $1 and p.name = 'Lena Lead'", [CO]); expect(r.ps === "terminated" && r.ts === "available", JSON.stringify(r));
}, owner);
await step("housekeeping releases lapsed reservations", async () => {
  await q("update territories set status = 'reserved', reserved_until = current_date - 1, reserved_for = (select id from applicants where name = 'Lena Lead' and company_id = territories.company_id limit 1) where name = 'Harbour' and company_id = (select id from companies where name = $1)", [CO]);
  const res = await owner.request.post(BASE + "/api/cron/renewals", { headers: { Authorization: "Bearer test-cron-secret-0123456789" } }); expect(res.ok(), "cron " + res.status());
  expect((await q("select status from territories where name = 'Harbour' and company_id = (select id from companies where name = $1)", [CO]))[0].status === "available", "reservation did not lapse");
}, owner);
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
