import { BASE, PW, addBranch, expect, fetchIn, lastMailLink, open, newUser, ownerWithCompany, q, signIn, signUpAndIn, step, summary, totp, uniq } from "./helpers.mjs";

console.log("Security: isolation, reset, lockout, two-factor, sessions, redirects, injection");
const { browser, page: a, errors } = await open();
const aMail = uniq("secA"), bMail = uniq("secB"); let b, branchId;

await step("two companies, one branch in A", async () => {
  await ownerWithCompany(a, aMail, "Alice A", `Alpha ${Date.now()}`); branchId = await addBranch(a, "Alpha HQ", "AHQ");
  ({ page: b } = await newUser(browser)); await ownerWithCompany(b, bMail, "Bob B", `Beta ${Date.now()}`);
});
await step("B cannot open A's branch by its address", async () => {
  const r = await b.goto(BASE + "/branches/" + branchId); expect(r.status() === 404, "status " + r.status()); await b.getByText("We can't find that").waitFor();
});
await step("B's branch list and exports never contain A's records", async () => {
  await b.goto(BASE + "/branches"); expect(await b.getByText("Alpha HQ").count() === 0, "A's branch visible to B");
  const csv = await fetchIn(b, "/api/export/branches"); expect(csv.status === 200 && !csv.text.includes("Alpha HQ"), "A's branch in B's export");
  const all = await fetchIn(b, "/api/export/company"); expect(all.status === 200 && !all.text.includes("Alpha HQ") && all.text.includes("Beta"), "A's branch in B's full export");
});
await step("B cannot download A's attachment", async () => {
  await a.goto(BASE + "/tasks/new"); await a.getByLabel("Title").fill("Secret plan"); await a.getByRole("button", { name: "Create task" }).click(); await a.getByText("Task created.").waitFor();
  await a.goto(BASE + "/tasks"); await a.getByRole("link", { name: "Secret plan" }).click(); await a.getByText("Proof of completion").first().waitFor().catch(() => {});
  const [t] = await q("select id, company_id from tasks where title = 'Secret plan' order by created_at desc limit 1");
  const [{ id }] = await q("insert into attachments(company_id, subject_table, subject_id, filename, content_type, size_bytes, data, uploaded_by) values ($1,'tasks',$2,'plan.txt','text/plain',4,'hush',(select id from identity.users where email = $3)) returning id", [t.company_id, t.id, aMail]);
  const mine = await fetchIn(a, "/api/files/" + id); expect(mine.status === 200 && mine.text === "hush", "A can't read their own file: " + mine.status);
  expect((await fetchIn(b, "/api/files/" + id)).status === 404, "B could read A's file");
  const c = await browser.newContext(); const anonPage = await c.newPage(); await anonPage.goto(BASE + "/signin"); const anon = await fetchIn(anonPage, "/api/files/" + id); expect(!anon.text.includes("hush"), "anonymous download allowed"); await c.close();
});
await step("text typed into a task is shown as text, never run", async () => {
  await a.goto(BASE + "/tasks/new"); await a.getByLabel("Title").fill(`<img src=x onerror="window.__x=1"> hello`); await a.getByRole("button", { name: "Create task" }).click(); await a.getByText("Task created.").waitFor();
  await a.goto(BASE + "/tasks"); await a.getByText("hello").first().waitFor(); expect(await a.evaluate(() => window.__x === undefined), "script ran");
});
await step("the sign-in redirect only ever goes to this site", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/signin?next=//evil.example/steal");
  await p.getByLabel("Email").fill(aMail); await p.getByLabel("Password").fill(PW); await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL((u) => u.origin === BASE);
  expect(new URL(p.url()).origin === BASE, "left the site: " + p.url()); await c.close();
});
await step("an unconfirmed address can't sign in", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); const e = uniq("unconf");
  await p.goto(BASE + "/signup"); await p.getByLabel("Your name").fill("Una"); await p.getByLabel("Work email").fill(e); await p.getByLabel("Password").fill(PW); await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/verify/);
  await signIn(p, e); await p.getByText("Confirm your email first").waitFor(); await c.close();
});
await step("signing up twice with one address gives the same response and no account leak", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/signup"); await p.getByLabel("Your name").fill("Dup"); await p.getByLabel("Work email").fill(aMail); await p.getByLabel("Password").fill(PW);
  await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/verify\?sent=1/); await p.getByText("We've sent a confirmation link").waitFor();
  expect((await q("select count(*)::int n from identity.users where email = $1", [aMail]))[0].n === 1, "duplicate account"); await c.close();
});
await step("five wrong passwords lock the account even for the right password", async () => {
  const c = await browser.newContext(); const p = await c.newPage();
  for (let i = 0; i < 5; i++) { await signIn(p, bMail, "definitely not it " + i); await p.getByText(/don't match|Too many/).waitFor(); }
  await signIn(p, bMail, PW); await p.getByText(/Too many failed attempts/).waitFor(); await c.close();
  await q("update identity.users set failed_attempts = 0, locked_until = null where email = $1", [bMail]);
});
await step("password reset: single-use link, old password dead, other devices signed out", async () => {
  const other = await newUser(browser); await signIn(other.page, aMail); await other.page.waitForURL((u) => u.pathname === "/");
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/forgot"); await p.getByLabel("Email").fill(aMail); await p.getByRole("button", { name: "Send reset link" }).click(); await p.getByText("If that address has an account").waitFor();
  const link = await lastMailLink(aMail, /http\S+reset\S+/); await p.goto(link); await p.getByLabel("New password").fill("a brand new passphrase 77"); await p.getByRole("button", { name: "Change password" }).click(); await p.getByText("Password changed.").waitFor();
  await p.goto(link); await p.getByText("This link isn't valid").waitFor();
  await other.page.goto(BASE + "/branches"); await other.page.waitForURL(/signin/);
  await signIn(p, aMail, PW); await p.getByText(/don't match/).waitFor(); await signIn(p, aMail, "a brand new passphrase 77"); await p.waitForURL((u) => u.pathname === "/");
  await q("update identity.users set password_hash = (select password_hash from identity.users where email = $2) where email = $1", [aMail, bMail]); await c.close(); await other.ctx.close();
});
await step("reset requests for unknown addresses look identical", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + "/forgot"); await p.getByLabel("Email").fill("nobody-" + Date.now() + "@example.com"); await p.getByRole("button", { name: "Send reset link" }).click(); await p.getByText("If that address has an account").waitFor(); await c.close();
});
await step("two-factor: enrol with a real authenticator code and get recovery codes", async () => {
  await a.goto(BASE + "/account"); await a.getByRole("button", { name: "Set up two-factor" }).click(); await a.getByRole("img", { name: /QR code/ }).waitFor();
  const [{ totp_secret }] = await q("select totp_secret from identity.users where email = $1", [aMail]);
  await a.getByLabel("Code from your app").fill("000000"); await a.getByRole("button", { name: "Turn on two-factor" }).click(); await a.getByText("That code isn't right").waitFor();
  await a.getByLabel("Code from your app").fill(totp(totp_secret)); await a.getByRole("button", { name: "Turn on two-factor" }).click(); await a.getByText("They won't be shown again").waitFor();
  const codes = await a.locator('[aria-label="Recovery codes"] li').allInnerTexts(); expect(codes.length === 8, "recovery codes: " + codes.length); globalThis.recovery = codes;
});
await step("two-factor: sign-in now needs the code; wrong codes fail; the right one works", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await signIn(p, aMail, "a brand new passphrase 77"); await p.waitForURL(/2fa/);
  await p.goto(BASE + "/branches"); await p.waitForURL(/2fa/);   // a half-signed-in session reaches nothing
  await p.getByLabel(/6-digit code/).fill("123456"); await p.getByRole("button", { name: "Continue" }).click(); await p.getByText("That code isn't right").waitFor();
  const [{ totp_secret }] = await q("select totp_secret from identity.users where email = $1", [aMail]);
  await p.getByLabel(/6-digit code/).fill(totp(totp_secret)); await p.getByRole("button", { name: "Continue" }).click(); await p.waitForURL((u) => u.pathname === "/"); await c.close();
});
await step("two-factor: a recovery code works exactly once", async () => {
  const code = globalThis.recovery[0];
  for (const [i, expectOk] of [[0, true], [1, false]]) {
    const c = await browser.newContext(); const p = await c.newPage(); await signIn(p, aMail, "a brand new passphrase 77"); await p.waitForURL(/2fa/);
    await p.getByLabel(/6-digit code/).fill(code); await p.getByRole("button", { name: "Continue" }).click();
    if (expectOk) await p.waitForURL((u) => u.pathname === "/"); else await p.getByText("That code isn't right").waitFor(); await c.close();
  }
});
await step("sessions: signing out another device ends it immediately", async () => {
  const other = await newUser(browser); await signIn(other.page, bMail, PW); await other.page.waitForURL((u) => u.pathname === "/");
  await b.goto(BASE + "/account"); await b.getByRole("button", { name: "Sign out all other devices" }).click(); await b.getByText("All other devices were signed out.").waitFor();
  await other.page.goto(BASE + "/branches"); await other.page.waitForURL(/signin/); await other.ctx.close();
});
await step("security headers are present", async () => {
  const r = await a.request.get(BASE + "/signin"); const h = r.headers();
  expect(h["x-frame-options"] === "DENY" && h["x-content-type-options"] === "nosniff", JSON.stringify({ xfo: h["x-frame-options"], xcto: h["x-content-type-options"] }));
  expect(!h["x-powered-by"], "x-powered-by leaked");
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
