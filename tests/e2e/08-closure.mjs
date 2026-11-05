import { BASE, db, addBranch, expect, inviteAndJoin, open, ownerWithCompany, q, step, summary, uniq } from "./helpers.mjs";

console.log("Flow 6: branch closure -> outstanding-work review -> access removal");
const { browser, page: owner, errors } = await open();
const CO = `Close Co ${Date.now()}`; const staffEmail = uniq("eaststaff"); let east, staff, eastUrl;

await step("a branch with an open task and an asset, and a person scoped to it", async () => {
  await ownerWithCompany(owner, uniq("closeowner"), "Cleo Owner", CO); await addBranch(owner, "Keep", "KP1"); eastUrl = await addBranch(owner, "East", "EA1");
  east = eastUrl;
  await owner.goto(BASE + "/tasks/new"); await owner.getByLabel("Title").fill("Count the till"); await owner.locator('select[name="branch_id"]').selectOption({ label: "East" }); await owner.getByRole("button", { name: "Create task" }).click(); await owner.getByText("Task created.").waitFor();
  await owner.goto(BASE + "/assets"); const f = owner.locator('form:has(button:has-text("Add asset"))'); await f.locator('select[name="branch_id"]').selectOption({ label: "East" }); await f.getByLabel(/^Name/).fill("Espresso machine"); await f.getByRole("button", { name: "Add asset" }).click(); await owner.getByText("Asset added.").waitFor();
  ({ page: staff } = await inviteAndJoin(owner, browser, staffEmail, "Eli East", "Employee"));
  await owner.goto(BASE + "/people"); await owner.locator("tr", { hasText: "Eli East" }).getByRole("link", { name: "Edit access" }).click();
  const editForm = owner.locator('form:has(button:has-text("Save access"))'); await editForm.getByLabel("East").check(); await editForm.getByRole("button", { name: "Save access" }).click(); await owner.getByText("Access updated.").waitFor();
});
await step("closing is blocked and says exactly what is outstanding", async () => {
  await owner.goto(BASE + `/branches/${east}/close`); await owner.getByText(/items? still outstanding/).waitFor();
  expect(await owner.getByRole("button", { name: "Close branch and remove access" }).count() === 0, "close button shown with work outstanding");
  await owner.getByText("Open tasks").waitFor(); await owner.getByText("Assigned assets").waitFor(); await owner.getByText("Eli East").waitFor();
});
await step("a direct attempt to close is refused by the database itself", async () => {
  const [{ id, owner_id }] = await q("select b.id, (select user_id from memberships m join membership_roles mr on mr.membership_id = m.id join roles r on r.id = mr.role_id where m.company_id = b.company_id and r.name = 'Company owner' limit 1) owner_id from branches b join companies c on c.id = b.company_id where c.name = $1 and b.code = 'EA1'", [CO]);
  const c = await db.connect(); let msg = "";
  try { await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub', $1, true)", [owner_id]); await c.query("select public.close_branch($1)", [id]); }
  catch (e) { msg = e.message; } finally { await c.query("rollback").catch(() => {}); c.release(); }
  expect(/open tasks|assets still assigned/.test(msg), "the database allowed it, or failed differently: " + msg);
});
await step("resolve the task and dispose of the asset; the screen updates", async () => {
  await owner.goto(BASE + "/tasks"); await owner.getByRole("link", { name: "Count the till" }).click(); await owner.getByLabel("Completion note").fill("Counted and banked"); await owner.getByRole("button", { name: "Mark done" }).click(); await owner.getByText("Task completed.").waitFor();
  await owner.goto(BASE + "/assets"); await owner.locator("tr", { hasText: "Espresso machine" }).getByLabel(/Status for/).selectOption("disposed"); await owner.locator("tr", { hasText: "Espresso machine" }).getByRole("button", { name: "Set" }).click(); await owner.getByText("Asset updated.").waitFor();
  await owner.goto(BASE + `/branches/${east}/close`); await owner.getByRole("button", { name: "Close branch and remove access" }).waitFor();
});
await step("the name must be typed exactly", async () => {
  await owner.getByLabel(/Type “East” to confirm/).fill("east"); await owner.getByRole("button", { name: "Close branch and remove access" }).click(); await owner.getByText("Type the branch name exactly").waitFor();
});
await step("closing removes access last and keeps history", async () => {
  await owner.getByLabel(/Type “East” to confirm/).fill("East"); await owner.getByRole("button", { name: "Close branch and remove access" }).click(); await owner.getByText("Branch closed and access removed.").waitFor();
  const [b] = await q("select b.status, b.closed_at is not null closed from branches b join companies c on c.id = b.company_id where c.name = $1 and b.code = 'EA1'", [CO]); expect(b.status === "closed" && b.closed, JSON.stringify(b));
  const [m] = await q("select m.status from memberships m join profiles p on p.id = m.user_id where p.email = $1", [staffEmail]); expect(m.status === "suspended", "scoped person still active: " + m.status);
  const [h] = await q("select count(*)::int n from branch_history h join branches b on b.id = h.branch_id join companies c on c.id = b.company_id where c.name = $1 and b.code = 'EA1'", [CO]); expect(h.n >= 2, "history missing: " + h.n);
});
await step("the person who lost access can't get into the workspace", async () => {
  await staff.goto(BASE + "/branches"); await staff.waitForURL(/onboarding/);
});
await step("a closed branch can't be reopened or edited, but stays visible", async () => {
  await owner.goto(BASE + "/branches?status=closed"); await owner.getByRole("link", { name: "East" }).click();
  expect(await owner.getByRole("button", { name: "Save changes" }).count() === 0, "edit form shown for a closed branch");
});
await step("the other branch is untouched", async () => {
  await owner.goto(BASE + "/branches?status=active"); await owner.getByRole("link", { name: "Keep" }).waitFor();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
