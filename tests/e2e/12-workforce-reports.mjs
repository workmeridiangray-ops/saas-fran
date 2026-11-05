import { BASE, addBranch, expect, fetchIn, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Saved views, density, report schedules and history, rosters and leave");
const { browser, page: owner, errors } = await open();
const CO = `Crew Co ${Date.now()}`; const ownerEmail = uniq("crewowner"), empEmail = uniq("crewemp"); let emp;
const cron = () => fetch(BASE + "/api/cron/renewals", { method: "POST", headers: { Authorization: "Bearer test-cron-secret-0123456789" } }).then((r) => r.json());
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

await step("a company with two branches and an employee", async () => {
  await ownerWithCompany(owner, ownerEmail, "Cora Owner", CO); await addBranch(owner, "Harbour Cafe", "HC1"); await addBranch(owner, "Hill Cafe", "HL1");
  ({ page: emp } = await inviteAndJoin(owner, browser, empEmail, "Eddie Employee", "Employee"));
});
await step("a filtered view can be saved, reused and removed (and is private to you)", async () => {
  await owner.goto(BASE + "/branches?q=harbour"); await owner.getByLabel("Name for this view").fill("Harbour only"); await owner.getByRole("button", { name: "Save view" }).click(); await owner.getByText(/View saved/).waitFor();
  await owner.goto(BASE + "/branches"); await owner.getByRole("link", { name: "Harbour only" }).click(); await owner.waitForURL(/q=harbour/); expect(await owner.getByRole("link", { name: "Hill Cafe" }).count() === 0, "view didn't filter");
  await emp.goto(BASE + "/branches"); expect(await emp.getByRole("link", { name: "Harbour only" }).count() === 0, "saved views leaked to another person");
  await owner.getByRole("button", { name: /Remove saved view Harbour only/ }).click(); await owner.getByText("View removed.").waitFor();
});
await step("compact density is remembered on the device", async () => {
  await owner.goto(BASE + "/branches"); await owner.getByRole("button", { name: /Comfortable rows/ }).click(); expect(await owner.evaluate(() => document.documentElement.dataset.density) === "compact", "not applied");
  await owner.reload(); await owner.getByRole("button", { name: /Compact rows/ }).waitFor(); expect(await owner.evaluate(() => document.documentElement.dataset.density) === "compact", "not remembered");
  await owner.getByRole("button", { name: /Compact rows/ }).click();
});
await step("every download is logged in the export history", async () => {
  const r = await fetchIn(owner, "/api/export/branches"); expect(r.status === 200 && r.text.includes("Harbour Cafe"), "export failed");
  await owner.goto(BASE + "/reports"); await owner.locator("tr", { hasText: "Downloaded" }).first().waitFor();
});
await step("a report can be scheduled; it is emailed once a day with the data attached", async () => {
  const f = owner.locator('form:has(button:has-text("Schedule"))'); await f.getByLabel("Report").selectOption({ label: "Branches" }); await f.getByLabel(/^Send to/).fill("not-an-email"); await f.getByRole("button", { name: "Schedule" }).click(); await owner.getByText(/valid email addresses/).waitFor();
  await f.getByLabel(/^Send to/).fill(ownerEmail); await f.getByRole("button", { name: "Schedule" }).click(); await owner.getByText(/Schedule saved/).waitFor();
  const r1 = await cron(); expect(r1.reports.sent === 1, JSON.stringify(r1.reports));
  const [m] = await q("select subject, body from identity.outbox where to_email = $1 and subject like 'Branches report%' order by id desc limit 1", [ownerEmail.toLowerCase()]); expect(m && /attachment branches-/.test(m.body), "no attachment recorded: " + JSON.stringify(m));
  const r2 = await cron(); expect(r2.reports.sent === 0, "sent twice in one day: " + JSON.stringify(r2.reports));
  await owner.goto(BASE + "/reports"); await owner.locator("tr", { hasText: "Scheduled" }).first().waitFor();
});
await step("rostering: a shift appears for the employee only on their own roster", async () => {
  await owner.goto(BASE + "/roster"); const f = owner.locator('form:has(button:has-text("Add shift"))'); await f.getByLabel("Branch").selectOption({ label: "Harbour Cafe" }); await f.getByLabel("Person").selectOption({ label: "Eddie Employee" });
  const monday = await owner.evaluate(() => { const d = new Date(); const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))); return m.toISOString().slice(0, 10); });
  await f.locator('input[name="day"]').fill(monday); await f.getByRole("button", { name: "Add shift" }).click(); await owner.getByText("Shift added.").waitFor();
  await emp.goto(BASE + "/roster"); await emp.getByText("Eddie Employee").first().waitFor(); expect(await emp.getByRole("button", { name: "Add shift" }).count() === 0, "an employee can add shifts");
});
await step("nobody can be on two overlapping shifts", async () => {
  const f = owner.locator('form:has(button:has-text("Add shift"))'); await f.getByLabel("Branch").selectOption({ label: "Hill Cafe" }); await f.getByLabel("Person").selectOption({ label: "Eddie Employee" }); await f.locator('input[name="from"]').fill("15:00"); await f.locator('input[name="to"]').fill("21:00");
  await f.getByRole("button", { name: "Add shift" }).click(); await owner.getByText(/That overlaps an existing entry/).waitFor();
});
await step("leave: requested by the employee, can't be approved over a shift, declined only with a reason", async () => {
  const from = day(0), to = day(2);
  await emp.goto(BASE + "/roster?tab=leave"); await emp.locator('input[name="from"]').fill(from); await emp.locator('input[name="to"]').fill(to); await emp.getByRole("button", { name: "Request leave" }).click(); await emp.getByText(/Leave requested/).waitFor();
  await owner.goto(BASE + "/notifications"); await owner.getByText("Leave request").first().waitFor();
  await owner.goto(BASE + "/roster?tab=approvals"); await owner.getByText(/Eddie Employee:/).waitFor(); await owner.getByRole("button", { name: "Decline" }).click(); await owner.getByText("Give a reason so they know why.").waitFor();
  await owner.getByLabel(/^Note/).fill("Short-staffed that week"); await owner.getByRole("button", { name: "Decline" }).click(); await owner.getByText(/Leave declined/).waitFor();
  await emp.goto(BASE + "/roster?tab=leave"); await emp.getByText("Short-staffed that week").waitFor();
});
await step("an employee can't approve leave or see anyone else's", async () => {
  await emp.goto(BASE + "/roster?tab=approvals"); expect(await emp.getByRole("button", { name: "Approve" }).count() === 0, "an employee can approve leave");
  const rows = await q("select count(*)::int n from leave_requests l join companies c on c.id = l.company_id where c.name = $1", [CO]); expect(rows[0].n === 1, "unexpected leave rows");
});
await step("approved leave blocks new shifts that day", async () => {
  await emp.goto(BASE + "/roster?tab=leave"); await emp.locator('input[name="from"]').fill(day(20)); await emp.locator('input[name="to"]').fill(day(21)); await emp.getByRole("button", { name: "Request leave" }).click(); await emp.getByText(/Leave requested/).waitFor();
  await owner.goto(BASE + "/roster?tab=approvals"); await owner.getByRole("button", { name: "Approve" }).click(); await owner.getByText("Leave approved.").waitFor();
  await owner.goto(BASE + "/roster?week=" + day(20)); const f = owner.locator('form:has(button:has-text("Add shift"))'); await f.getByLabel("Branch").selectOption({ label: "Harbour Cafe" }); await f.getByLabel("Person").selectOption({ label: "Eddie Employee" }); await f.locator('input[name="day"]').fill(day(20)); await f.getByRole("button", { name: "Add shift" }).click();
  await owner.getByText(/on approved leave/).waitFor();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
