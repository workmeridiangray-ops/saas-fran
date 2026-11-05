import { BASE, PW, addBranch, expect, fetchIn, open, ownerWithCompany, q, signUpAndIn, step, summary, uniq } from "./helpers.mjs";

console.log("Flow 5: plan change -> limit validation -> billing; plus platform admin and company lifecycle");
const { browser, page: owner, errors } = await open();
const CO = `Bill Co ${Date.now()}`; const ownerEmail = uniq("billowner"), staffEmail = uniq("staff");
const cron = (secret) => owner.request.post(BASE + "/api/cron/renewals", { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
const companyStatus = async () => (await q("select status from companies where name = $1", [CO]))[0].status;
let staff;

await step("company with four branches (Growth allows 25)", async () => {
  await ownerWithCompany(owner, ownerEmail, "Bea Owner", CO);
  for (const [n, c] of [["One", "B1"], ["Two", "B2"], ["Three", "B3"], ["Four", "B4"]]) await addBranch(owner, n, c);
});
await step("moving to Starter (3 branches) explains what happens and deletes nothing", async () => {
  await owner.goto(BASE + "/billing?to=starter");
  await owner.getByText(/You have 4 branches and this plan includes 3/).waitFor(); await owner.getByText(/Nothing will be deleted/).first().waitFor();
  await owner.getByRole("button", { name: /Confirm and choose what stays active/ }).click(); await owner.getByText("It applies now, during your trial.").waitFor();
});
await step("existing branches stay; a fifth is blocked with a way to upgrade", async () => {
  expect((await q("select count(*)::int n from branches b join companies c on c.id = b.company_id where c.name = $1", [CO]))[0].n === 4, "branches were removed");
  await owner.goto(BASE + "/branches/new"); await owner.getByLabel("Branch name").fill("Five"); await owner.getByLabel("Code").fill("B5"); await owner.getByRole("button", { name: "Add branch" }).click();
  await owner.getByText(/plan limit reached: your plan includes 3 branches/).waitFor(); await owner.getByRole("link", { name: "See plans and upgrade" }).waitFor();
  expect((await q("select count(*)::int n from branches b join companies c on c.id = b.company_id where c.name = $1", [CO]))[0].n === 4, "a branch was added over the limit");
});
await step("modules the plan drops disappear from the menu but the data stays", async () => {
  await owner.goto(BASE + "/"); expect(await owner.getByRole("link", { name: "Purchasing" }).count() === 0, "Purchasing still in the menu");
  await owner.goto(BASE + "/purchasing"); await owner.getByText("isn't on your plan").waitFor();
});
await step("back to Growth, then the cron endpoint rejects strangers", async () => {
  await owner.goto(BASE + "/billing?to=growth"); await owner.getByRole("button", { name: /Confirm/ }).click(); await owner.getByText("It applies now, during your trial.").waitFor();
  expect((await cron(null)).status() === 401, "cron accepted a request with no secret"); expect((await cron("wrong-secret-wrong-secret")).status() === 401, "cron accepted a wrong secret");
});
await step("when the trial ends an invoice is issued at the plan's price", async () => {
  await q("update subscriptions set current_period_end = now() - interval '1 day' where company_id = (select id from companies where name = $1)", [CO]);
  const res = await cron("test-cron-secret-0123456789"); expect(res.ok(), "cron failed " + res.status());
  await owner.goto(BASE + "/billing"); await owner.getByText("1 unpaid invoice").waitFor(); await owner.getByText("$299.00").first().waitFor();
});
await step("running the scheduler twice does not double-invoice", async () => {
  await cron("test-cron-secret-0123456789");
  expect((await q("select count(*)::int n from platform_invoices i join companies c on c.id = i.company_id where c.name = $1", [CO]))[0].n === 1, "duplicate invoice");
});
await step("an invoice cannot be edited after issue", async () => {
  let blocked = false; try { await q("update platform_invoices set amount_minor = 1 where company_id = (select id from companies where name = $1)", [CO]); } catch { blocked = true; }
  expect(blocked, "invoice amount was changed");
});
await step("a long-unpaid company becomes read-only but stays readable and exportable", async () => {
  await q("update platform_invoices set due_at = now() - interval '12 days' where company_id = (select id from companies where name = $1)", [CO]);
  await cron("test-cron-secret-0123456789"); expect(await companyStatus() === "suspended", await companyStatus());
  await owner.goto(BASE + "/branches"); await owner.getByText(/read-only until the open invoice is paid/).waitFor(); await owner.getByRole("link", { name: "One" }).waitFor();
  await owner.goto(BASE + "/tasks/new"); await owner.getByRole("heading", { name: "This workspace is read-only" }).waitFor(); expect(await owner.getByLabel("Title").count() === 0, "create form shown while suspended");
  const exp = await fetchIn(owner, "/api/export/company"); expect(exp.status === 200 && JSON.parse(exp.text).branches.length === 4, "export unavailable while suspended: " + exp.status);
});
await step("a non-staff user can't open platform admin", async () => {
  await owner.goto(BASE + "/platform"); expect(!/\/platform/.test(owner.url()), "customer reached /platform: " + owner.url());
});
await step("platform staff see the company and record the payment", async () => {
  const { ctx, page } = await (async () => { const c = await browser.newContext(); return { ctx: c, page: await c.newPage() }; })(); staff = page;
  await signUpAndIn(staff, staffEmail, "Sam Staff"); await staff.waitForURL(/onboarding/);
  await q("insert into platform_staff(user_id, role) select id, 'billing' from identity.users where email = $1", [staffEmail]);
  await staff.goto(BASE + "/platform/invoices"); await staff.getByText(CO).waitFor();
  const row = staff.locator("tr", { hasText: CO }); await row.getByRole("button", { name: "Mark paid" }).click(); await staff.getByText("Payment recorded.").waitFor();
  expect(await companyStatus() === "active", "company not reactivated: " + await companyStatus());
});
await step("support-level staff can look but not change anything", async () => {
  await q("update platform_staff set role = 'support' where user_id = (select id from identity.users where email = $1)", [staffEmail]);
  const [{ id: coId }] = await q("select id from companies where name = $1", [CO]); globalThis.coUrl = BASE + "/platform/companies/" + coId; await staff.goto(globalThis.coUrl);
  expect(await staff.getByRole("button", { name: /Suspend company/ }).count() === 0, "support staff can suspend");
  await q("update platform_staff set role = 'billing' where user_id = (select id from identity.users where email = $1)", [staffEmail]);
});
await step("billing staff suspend with a recorded reason; it is audited under their name", async () => {
  await staff.goto(globalThis.coUrl); await staff.getByLabel("Reason").fill("Chargeback under review"); await staff.getByRole("button", { name: "Suspend company" }).click(); await staff.getByText("Company suspended.").waitFor();
  const [a] = await q("select count(*)::int n from audit_log where table_name = 'companies' and op like 'status:suspended:%' and actor = (select id from identity.users where email = $1)", [staffEmail]); expect(a.n === 1, "no audit entry");
  await staff.getByLabel("Reason").fill("Resolved"); await staff.getByRole("button", { name: "Reactivate company" }).click(); await staff.getByText("Company reactivated.").waitFor();
});
await step("the owner can write again, and starts closing the company", async () => {
  await owner.goto(BASE + "/tasks/new"); await owner.getByLabel("Title").fill("Back to work"); await owner.getByRole("button", { name: "Create task" }).click(); await owner.getByText("Task created.").waitFor();
  await owner.goto(BASE + "/billing"); await owner.getByLabel(/Type “.*” to confirm/).fill("wrong"); await owner.getByRole("button", { name: "Start closure" }).click(); await owner.getByText("Type the company name exactly").waitFor();
  await owner.getByLabel(/Type “.*” to confirm/).fill(CO); await owner.getByRole("button", { name: "Start closure" }).click(); await owner.getByText("Closure started.").waitFor();
  expect(await companyStatus() === "closing", await companyStatus());
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
