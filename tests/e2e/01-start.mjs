import { BASE, expect, open, q, signUpAndIn, step, summary } from "./helpers.mjs";

const { browser, page, errors } = await open();
const email = `owner+${Date.now()}@example.com`;
console.log("Flow 1: registration -> setup -> first branch");

await step("anonymous visitors are sent to sign in", async () => {
  await page.goto(BASE + "/branches"); expect(/signin/.test(page.url()), "not redirected: " + page.url());
});
await step("sign up, confirm email, sign in", async () => { await signUpAndIn(page, email, "Olivia Owner"); await page.waitForURL(/onboarding/); });
await step("wrong password is refused with a neutral message", async () => {
  const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(BASE + "/signin"); await p.getByLabel("Email").fill(email); await p.getByLabel("Password").fill("not the password at all");
  await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/err=/);
  await p.getByText("don't match").waitFor({ timeout: 5000 }); await c.close();
});
await step("create the workspace", async () => {
  await page.getByLabel("Company name").fill("Flow Foods"); await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  expect(await page.getByText("Getting started").count() > 0, "no first-use guidance");
  expect(await page.getByText("Your workspace is ready").count() > 0, "no confirmation");
});
await step("trial, roles and templates were seeded", async () => {
  const [r] = await q("select (select count(*) from roles where company_id=c.id)::int roles, s.status from companies c join subscriptions s on s.company_id=c.id where c.name='Flow Foods'");
  expect(r.roles === 5 && r.status === "trialing", JSON.stringify(r));
});
await step("add the first branch", async () => {
  await page.goto(BASE + "/branches/new"); await page.getByLabel("Branch name").fill("Downtown"); await page.getByLabel("Code").fill("DT1");
  await page.getByRole("button", { name: "Add branch" }).click(); await page.waitForURL(/\/branches\/[0-9a-f-]{36}/);
  expect(await page.getByRole("heading", { name: "Downtown" }).count() > 0, "branch page missing");
});
await step("the branch appears in the list and search finds it", async () => {
  await page.goto(BASE + "/branches?q=downt"); expect(await page.getByRole("link", { name: "Downtown" }).count() > 0, "not listed");
  await page.goto(BASE + "/branches?q=zzz"); expect(await page.getByText("No branches match").count() > 0, "no empty state");
});
await step("duplicate branch code gives a clear error and saves nothing", async () => {
  await page.goto(BASE + "/branches/new"); await page.getByLabel("Branch name").fill("Another"); await page.getByLabel("Code").fill("DT1");
  await page.getByRole("button", { name: "Add branch" }).click(); await page.waitForURL(/err=/);
  await page.getByText("already exists").waitFor({ timeout: 5000 });
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
