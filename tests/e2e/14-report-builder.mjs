import { BASE, addBranch, expect, fetchIn, inviteAndJoin, open, ownerWithCompany, q, step, uniq, summary } from "./helpers.mjs";

console.log("Report builder: choose columns and filters, preview, save, download, respect access");
const { browser, page: owner, errors } = await open();
const CO = `Builder Co ${Date.now()}`; const ownerEmail = uniq("bldowner"), empEmail = uniq("bldemp"); let emp;

await step("a company with two branches, tasks and a custom field", async () => {
  await ownerWithCompany(owner, ownerEmail, "Bea Owner", CO); await addBranch(owner, "North Cafe", "NC1"); await addBranch(owner, "South Cafe", "SC1");
  await owner.goto(BASE + "/studio"); const f = owner.locator('form:has(button:has-text("Add field"))'); await f.getByLabel("Add it to").selectOption("tasks"); await f.getByLabel("Field name").fill("Cost code"); await f.getByLabel("Type").selectOption("text"); await f.getByRole("button", { name: "Add field" }).click(); await owner.getByText("Field added.").waitFor();
  for (const [title, code] of [["Mop floors", "CC-1"], ["Check fridge", "CC-2"]]) { await owner.goto(BASE + "/tasks/new"); await owner.getByLabel("Title").fill(title); await owner.getByLabel("Cost code").fill(code); await owner.getByRole("button", { name: "Create task" }).click(); await owner.getByText("Task created.").waitFor(); }
  ({ page: emp } = await inviteAndJoin(owner, browser, empEmail, "Ed Employee", "Employee"));
});
await step("with no columns chosen, it says so instead of running", async () => {
  await owner.goto(BASE + "/reports/builder?dataset=tasks"); await owner.getByRole("button", { name: "Preview" }).click(); await owner.getByText("Pick at least one column.").waitFor();
});
await step("pick columns (including the company's own field) and preview", async () => {
  await owner.goto(BASE + "/reports/builder?dataset=tasks");
  for (const l of ["Title", "Status", "Cost code"]) await owner.getByLabel(l, { exact: true }).check();
  await owner.getByRole("button", { name: "Preview" }).click(); await owner.getByRole("columnheader", { name: "Cost code" }).waitFor(); await owner.getByRole("cell", { name: "CC-1" }).waitFor(); await owner.getByRole("cell", { name: "Mop floors" }).waitFor();
});
await step("filters narrow the rows and a bad date is refused", async () => {
  await owner.getByLabel("Only show status").selectOption("done"); await owner.getByRole("button", { name: "Preview" }).click(); await owner.getByText("Nothing matches these filters.").waitFor();
  await owner.getByLabel("Only show status").selectOption(""); await owner.getByLabel("From (date added)").fill("2999-01-01"); await owner.getByRole("button", { name: "Preview" }).click(); await owner.getByText("Nothing matches these filters.").waitFor();
  await owner.goto(BASE + "/reports/builder?dataset=tasks&go=1&col=title&from=01/02/2026"); await owner.getByText("Dates must look like").waitFor();
});
await step("a report can be saved, listed and downloaded as CSV with the chosen columns only", async () => {
  await owner.goto(BASE + "/reports/builder?dataset=tasks&go=1&col=title&col=cf%3Acost_code&sort=title&dir=asc");
  await owner.getByLabel("Report name").fill("Tasks with cost code"); await owner.getByRole("button", { name: "Save report" }).click(); await owner.getByText("Report saved.").waitFor();
  await owner.getByText("Tasks with cost code").waitFor();
  const [r] = await q("select id from custom_reports where name = 'Tasks with cost code'");
  const res = await fetchIn(owner, `/api/export/custom/${r.id}`); expect(res.status === 200, "status " + res.status);
  const lines = res.text.trim().split(/\r?\n/); expect(lines[0] === "Title,Cost code", "header: " + lines[0]); expect(lines.length === 3 && lines[1] === "Check fridge,CC-2" && lines[2] === "Mop floors,CC-1", res.text);
  await owner.goto(BASE + "/reports"); await owner.locator("tr", { hasText: "Tasks with cost code (custom)" }).first().waitFor();
});
await step("a saved custom report can be scheduled and is emailed as a CSV attachment", async () => {
  await owner.goto(BASE + "/reports"); const f = owner.locator('form:has(button:has-text("Schedule"))'); await f.getByLabel("Report").selectOption({ label: "Tasks with cost code (custom)" });
  await f.getByLabel(/^Send to/).fill(ownerEmail); await f.getByRole("button", { name: "Schedule" }).click(); await owner.getByText(/Schedule saved/).waitFor();
  const r = await fetch(BASE + "/api/cron/renewals", { method: "POST", headers: { Authorization: "Bearer test-cron-secret-0123456789" } }).then((x) => x.json()); expect(r.reports.sent === 1, JSON.stringify(r.reports));
  const [m] = await q("select subject, body from identity.outbox where to_email = $1 and subject like 'Tasks with cost code report%' order by id desc limit 1", [ownerEmail.toLowerCase()]); expect(m && /\(2 rows\)/.test(m.body) && /attachment tasks-with-cost-code-\d{4}-\d{2}-\d{2}\.csv/.test(m.body), JSON.stringify(m));
});
await step("the same name can't be saved twice", async () => {
  await owner.goto(BASE + "/reports/builder?dataset=tasks&go=1&col=title"); await owner.getByLabel("Report name").fill("Tasks with cost code"); await owner.getByRole("button", { name: "Save report" }).click(); await owner.getByText("That already exists.").waitFor();
});
await step("an employee can't build or download it", async () => {
  await emp.goto(BASE + "/reports/builder"); expect(await emp.getByRole("button", { name: "Preview" }).count() === 0, "an employee can use the builder");
  const [r] = await q("select id from custom_reports where name = 'Tasks with cost code'");
  const res = await fetchIn(emp, `/api/export/custom/${r.id}`); expect(res.status === 403 || res.status === 404, "employee got " + res.status);
});
await step("removing a saved report removes it", async () => {
  await owner.goto(BASE + "/reports"); await owner.locator("li", { hasText: "Tasks with cost code" }).getByRole("button", { name: "Remove" }).click(); await owner.getByText("Report removed.").waitFor();
  expect((await q("select count(*)::int n from custom_reports where name = 'Tasks with cost code'"))[0].n === 0, "still there");
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
