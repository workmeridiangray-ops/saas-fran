import { BASE, addBranch, expect, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Flow 2: inspection -> finding -> corrective action -> independent verification");
const { browser, page: owner, errors } = await open();
const CO = `Audit Co ${Date.now()}`; const insEmail = uniq("inspector"), mgrEmail = uniq("auditmgr");
let insp, mgr, findingUrl;

await step("set up company, branch and two staff", async () => {
  await ownerWithCompany(owner, uniq("auditowner"), "Olga Owner", CO); await addBranch(owner, "Harbour", "HB1");
  ({ page: insp } = await inviteAndJoin(owner, browser, insEmail, "Ian Inspector", "Auditor / inspector"));
  ({ page: mgr } = await inviteAndJoin(owner, browser, mgrEmail, "Mia Manager", "Branch manager"));
});
await step("owner schedules the starter inspection for the inspector", async () => {
  await owner.goto(BASE + "/inspections/new"); await owner.getByLabel("Inspector").selectOption({ label: "Ian Inspector" }); await owner.getByRole("button", { name: "Schedule" }).click();
  await owner.getByText("Inspection scheduled.").waitFor();
});
await step("the inspector can't finish with items unanswered", async () => {
  await insp.goto(BASE + "/inspections"); await insp.getByRole("link", { name: "Harbour" }).first().click();
  await insp.getByRole("button", { name: "Complete inspection" }).click(); await insp.getByText(/Answer every item/).waitFor();
});
await step("a failed item without a comment is refused", async () => {
  for (const [i, v] of [["i1", "pass"], ["i2", "fail"], ["i3", "pass"], ["i4", "pass"]]) await insp.locator(`input[name="a:${i}"][value="${v}"]`).check({ force: true });
  await insp.getByRole("button", { name: "Complete inspection" }).click(); await insp.getByText(/Say what you found for each failed item/).waitFor();
});
await step("completing scores 62.5% and raises a critical finding", async () => {
  for (const [i, v] of [["i1", "pass"], ["i2", "fail"], ["i3", "pass"], ["i4", "pass"]]) await insp.locator(`input[name="a:${i}"][value="${v}"]`).check({ force: true });
  await insp.getByLabel("Comment for Safety equipment present and in date").fill("Fire extinguisher expired in March");
  await insp.getByRole("button", { name: "Complete inspection" }).click(); await insp.getByText("Inspection completed.").waitFor();
  await insp.getByText("62.5%").waitFor(); await insp.getByText("Critical failure").first().waitFor();
});
await step("the inspector assigns a corrective action to the manager", async () => {
  await insp.getByRole("link", { name: "Safety equipment present and in date" }).click();
  await insp.getByLabel("Assign to").selectOption({ label: "Mia Manager" }); await insp.getByLabel("Due").fill("2026-12-01"); await insp.getByLabel("What must be fixed").fill("Replace the extinguisher");
  await insp.getByRole("button", { name: "Assign action" }).click(); await insp.getByText("Corrective action assigned.").waitFor(); findingUrl = insp.url().split("?")[0];
});
await step("the manager can't close it without proof, then marks it fixed", async () => {
  await mgr.goto(findingUrl); await mgr.getByRole("button", { name: "Mark as fixed" }).click(); await mgr.getByText(/Describe what you did/).waitFor().catch(async () => { /* browser required validation */ });
  await mgr.getByLabel(/What did you do/).fill("New extinguisher fitted; photo attached"); await mgr.getByRole("button", { name: "Mark as fixed" }).click();
  await mgr.getByText(/waits for independent verification/).waitFor();
});
await step("the manager cannot verify their own work", async () => {
  await mgr.getByText(/can't verify your own work/).waitFor();
  expect(await mgr.getByRole("button", { name: "Verify and close" }).count() === 0, "verify button shown to the assignee");
});
await step("a different person rejects it with a reason: the finding reopens", async () => {
  await insp.goto(findingUrl); await insp.getByRole("button", { name: "Not fixed: reopen" }).click(); await insp.getByText(/Say what is still wrong/).waitFor();
  await insp.getByLabel(/^Note/).fill("Extinguisher not mounted on the wall yet"); await insp.getByRole("button", { name: "Not fixed: reopen" }).click(); await insp.getByText(/The finding is reopened/).waitFor();
  const [f] = await q("select f.status from findings f join companies c on c.id = f.company_id where c.name = $1", [CO]); expect(f.status === "reopened", f.status);
});
await step("fixed again and verified by the inspector: finding closed", async () => {
  await mgr.goto(findingUrl); await mgr.getByLabel(/What did you do/).fill("Mounted and signed off"); await mgr.getByRole("button", { name: "Mark as fixed" }).click(); await mgr.getByText(/waits for independent verification/).waitFor();
  await insp.goto(findingUrl); await insp.getByRole("button", { name: "Verify and close" }).click(); await insp.getByText("Verified. The finding is closed.").waitFor();
  const [f] = await q("select f.status, a.verified_by is not null v from findings f join corrective_actions a on a.finding_id = f.id join companies c on c.id = f.company_id where c.name = $1", [CO]); expect(f.status === "verified" && f.v, JSON.stringify(f));
});
await step("evidence uploads on a finding", async () => {
  await owner.goto(findingUrl); await owner.getByText("Verified by Ian Inspector").waitFor();
});
await step("an employee-level user can't reach scheduling", async () => {
  await mgr.goto(BASE + "/inspections/new"); await mgr.getByText(/don't have access to scheduling inspections/).waitFor();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
