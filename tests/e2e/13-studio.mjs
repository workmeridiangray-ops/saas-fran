import { BASE, addBranch, expect, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Configuration studio: custom fields, validation, terminology");
const { browser, page: owner, errors } = await open();
const CO = `Studio Co ${Date.now()}`; const ownerEmail = uniq("studioowner"), empEmail = uniq("studioemp"); let emp; const CODE = "P" + String(Date.now()).slice(-6);
const addField = async (entity, label, kind, extra = {}) => {
  await owner.goto(BASE + "/studio"); const f = owner.locator('form:has(button:has-text("Add field"))');
  await f.getByLabel("Add it to").selectOption(entity); await f.getByLabel("Field name").fill(label); await f.getByLabel("Type").selectOption(kind);
  if (extra.options) await f.getByLabel(/^Options/).fill(extra.options);
  if (extra.required) await f.getByLabel("Required").check();
  await f.getByRole("button", { name: "Add field" }).click();
};

await step("a company with an employee", async () => {
  await ownerWithCompany(owner, ownerEmail, "Sam Owner", CO);
  ({ page: emp } = await inviteAndJoin(owner, browser, empEmail, "Eve Employee", "Employee"));
});
await step("the owner defines fields; a list needs two options", async () => {
  await addField("branches", "Format", "select", { options: "Kiosk", required: true }); await owner.getByText("at least two options").waitFor();
  await addField("branches", "Format", "select", { options: "Kiosk, Dine-in", required: true }); await owner.getByText("Field added.").waitFor();
  await addField("branches", "Seats", "number"); await owner.getByText("Field added.").waitFor();
  await addField("branches", "Opened on", "date"); await owner.getByText("Field added.").waitFor();
  await addField("tasks", "Cost code", "text"); await owner.getByText("Field added.").waitFor();
  await addField("tickets", "Customer phone", "text"); await owner.getByText("Field added.").waitFor();
});
await step("the fields show up on the branch form; a required one blocks saving and keeps what was typed", async () => {
  await owner.goto(BASE + "/branches/new"); await owner.getByLabel("Branch name").fill("Pier Kiosk"); await owner.getByLabel("Code").fill(CODE); await owner.getByLabel("Seats").fill("12");
  await owner.getByRole("button", { name: "Add branch" }).click(); await owner.waitForURL(/err=/); await owner.getByText("Format is required").waitFor();
  await owner.waitForFunction(() => document.querySelector('input[name="name"]')?.value === "Pier Kiosk" && document.querySelector('input[name="cf_seats"]')?.value === "12", null, { timeout: 5000 }).catch(() => { throw new Error("typed values were lost"); });
  expect((await q(`select count(*)::int n from branches where code = '${CODE}'`))[0].n === 0, "saved despite the error");
});
await step("valid values save and appear on the branch", async () => {
  await owner.getByLabel("Format").selectOption("Kiosk"); await owner.getByRole("button", { name: "Add branch" }).click(); await owner.waitForURL(/\/branches\/[0-9a-f-]{36}/);
  const [b] = await q(`select custom from branches where code = '${CODE}'`); expect(b.custom.format === "Kiosk" && b.custom.seats === 12, JSON.stringify(b));
  expect(await owner.getByLabel("Seats").inputValue() === "12", "value not shown on the edit form");
});
await step("a record can be edited and the values change", async () => {
  await owner.getByLabel("Seats").fill("30"); await owner.getByLabel("Opened on").fill("2026-02-01"); await owner.getByRole("button", { name: "Save changes" }).click(); await owner.getByText("Branch details saved.").waitFor();
  const [b] = await q(`select custom from branches where code = '${CODE}'`); expect(b.custom.seats === 30 && b.custom.opened_on === "2026-02-01", JSON.stringify(b));
});
await step("tasks and tickets get their own fields and show them on the record", async () => {
  await owner.goto(BASE + "/tasks/new"); await owner.getByLabel("Title").fill("Fix the sign"); await owner.getByLabel("Cost code").fill("CC-77"); await owner.getByRole("button", { name: "Create task" }).click(); await owner.getByText("Task created.").waitFor();
  await owner.getByRole("link", { name: "Fix the sign" }).click(); await owner.getByText("CC-77").waitFor(); await owner.getByText("Additional details").waitFor();
  await owner.goto(BASE + "/tickets/new"); await owner.getByLabel("Title").fill("Cold drinks"); await owner.getByLabel("Customer phone").fill("555 0100"); await owner.getByRole("button", { name: "Raise ticket" }).click(); await owner.waitForURL(/\/tickets\/[0-9a-f-]{36}/); await owner.getByText("555 0100").waitFor();
});
await step("the database refuses values that bypass the form", async () => {
  let refused = false; try { await q(`update branches set custom = '{"format":"Truck"}' where code = '${CODE}'`); } catch { refused = true; }
  // q connects as a privileged role in tests, so triggers (not RLS) are what we rely on here
  expect(refused, "an option that isn't in the list was accepted");
});
await step("an employee cannot open the studio", async () => {
  await emp.goto(BASE + "/studio"); await emp.getByText(/don't have access|isn't available|permission/i).first().waitFor();
});
await step("archiving a field hides it but keeps the saved values", async () => {
  await owner.goto(BASE + "/studio"); await owner.locator("tr", { hasText: "Seats" }).getByRole("button", { name: "Archive" }).click(); await owner.getByText(/Field archived/).waitFor();
  await owner.goto(BASE + "/branches/new"); expect(await owner.getByLabel("Seats").count() === 0, "archived field still on the form");
  const [b] = await q(`select custom from branches where code = '${CODE}'`); expect(b.custom.seats === 30, "value lost on archive");
});
await step("renaming Branches to Stores changes the menu and the page title", async () => {
  await owner.goto(BASE + "/studio"); await owner.locator('input[name="branch_singular"]').fill("Store"); await owner.locator('input[name="branch_plural"]').fill("Stores");
  await owner.getByRole("button", { name: "Save terminology" }).click(); await owner.getByText("Terminology saved.").waitFor();
  await owner.goto(BASE + "/branches"); await owner.getByRole("heading", { name: "Stores" }).waitFor(); await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Stores" }).waitFor();
  await emp.goto(BASE + "/tasks"); await emp.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
