import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BASE, expect, open, ownerWithCompany, addBranch, q, step, summary, uniq } from "./helpers.mjs";

console.log("Integrations: API keys, read API, signed webhooks, retries");
const { browser, page: owner, errors } = await open();
const CO = `Hooks ${Date.now()}`, OTHER = `Other ${Date.now()}`; const SECRET_CRON = "test-cron-secret-0123456789";
const received = []; let mode = 200;
const server = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { received.push({ headers: req.headers, body: b, mode }); res.statusCode = mode; res.end("ok"); }); });
await new Promise((r) => server.listen(0, "127.0.0.1", r)); const PORT = server.address().port;
const verify = (secret, body, header) => { const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? ""); if (!m) return false; const exp = createHmac("sha256", secret).update(`${m[1]}.${body}`).digest(); return timingSafeEqual(exp, Buffer.from(m[2], "hex")) && Math.abs(Date.now() / 1000 - Number(m[1])) < 300; };
const cron = () => fetch(BASE + "/api/cron/webhooks", { method: "POST", headers: { Authorization: `Bearer ${SECRET_CRON}` } }).then((r) => r.json());
const api = (key, path) => fetch(BASE + "/api/v1/" + path, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
let key, otherKey, secret;

await step("owner on the Scale plan with two branches", async () => {
  await ownerWithCompany(owner, uniq("hookowner"), "Hana Owner", CO); await owner.goto(BASE + "/billing?to=scale"); await owner.getByRole("button", { name: /Confirm/ }).click(); await owner.getByText("It applies now, during your trial.").waitFor();
  await addBranch(owner, "North", "NO1"); await addBranch(owner, "South", "SO1");
});
await step("an API key is created and its secret is shown once", async () => {
  await owner.goto(BASE + "/integrations"); const f = owner.locator('form:has(button:has-text("Create key"))');
  await f.getByLabel(/^Name/).fill("Dashboard"); await f.getByRole("button", { name: "Create key" }).click(); await owner.getByText("Choose what the key may read.").waitFor();
  await f.getByLabel("Branches").check(); await f.getByRole("button", { name: "Create key" }).click(); await owner.getByText(/Copy the API key now/).waitFor();
  key = await owner.getByLabel("Your new API key").inputValue(); expect(/^nmk_[0-9a-f]{8}_/.test(key), "odd key: " + key);
  await owner.goto(BASE + "/integrations"); expect(!(await owner.content()).includes(key), "the secret is still on the page after leaving it");
  const [r] = await q("select key_hash from api_keys k join companies c on c.id = k.company_id where c.name = $1", [CO]); expect(r.key_hash !== key && !r.key_hash.includes(key), "key stored in the clear");
});
await step("the API needs a valid key and the right scope", async () => {
  expect((await api(null, "branches")).status === 401, "no key accepted"); expect((await api("nmk_00000000_" + "x".repeat(30), "branches")).status === 401, "bad key accepted");
  expect((await api(key, "tasks")).status === 403, "scope not enforced");
});
await step("it returns only this company's branches, newest first, with paging", async () => {
  const r = await api(key, "branches?limit=1"); expect(r.status === 200, String(r.status)); const j = await r.json(); expect(j.data.length === 1 && j.data[0].code === "SO1" && j.next, JSON.stringify(j));
  const r2 = await (await api(key, "branches?limit=1&after=" + encodeURIComponent(j.next))).json(); expect(r2.data[0].code === "NO1" && r2.next === null, JSON.stringify(r2));
  expect(!JSON.stringify(j).includes("company_id"), "internal ids exposed");
});
await step("a key can't see another company's data", async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await ownerWithCompany(p, uniq("otherowner"), "Otto Owner", OTHER); await p.goto(BASE + "/billing?to=scale"); await p.getByRole("button", { name: /Confirm/ }).click(); await p.getByText("It applies now, during your trial.").waitFor();
  await addBranch(p, "Secret branch", "SEC"); await p.goto(BASE + "/integrations"); const f = p.locator('form:has(button:has-text("Create key"))'); await f.getByLabel(/^Name/).fill("Theirs"); await f.getByLabel("Branches").check(); await f.getByRole("button", { name: "Create key" }).click(); otherKey = await p.getByLabel("Your new API key").inputValue(); await c.close();
  const mine = JSON.stringify(await (await api(key, "branches?limit=100")).json()); expect(!mine.includes("SEC"), "saw the other company's branch");
  const theirs = JSON.stringify(await (await api(otherKey, "branches?limit=100")).json()); expect(theirs.includes("SEC") && !theirs.includes("NO1"), "other key sees the wrong data");
});
await step("the API is rate limited", async () => {
  let limited = 0; for (let i = 0; i < 125; i++) { const r = await api(otherKey, "branches?limit=1"); if (r.status === 429) { limited++; expect(r.headers.get("retry-after"), "no Retry-After"); } }
  expect(limited > 0, "never rate limited");
});
await step("a revoked key stops working at once", async () => {
  await owner.goto(BASE + "/integrations"); await owner.getByRole("button", { name: "Revoke" }).click(); await owner.getByText(/Key revoked/).waitFor(); expect((await api(key, "branches")).status === 401, "revoked key still works");
});
await step("a webhook is created for ticket events and the secret is shown once", async () => {
  const f = owner.locator('form:has(button:has-text("Add webhook"))'); await f.getByLabel(/^Address/).fill(`http://127.0.0.1:${PORT}/hook`); await f.getByRole("button", { name: "Add webhook" }).click(); await owner.getByText("Choose at least one event to send.").waitFor();
  await f.getByLabel("A ticket is raised").check(); await f.getByRole("button", { name: "Add webhook" }).click(); await owner.getByText(/Copy the signing secret now/).waitFor(); secret = await owner.getByLabel("Your new signing secret").inputValue(); expect(secret.startsWith("whsec_"), secret);
});
await step("raising a ticket sends a correctly signed event", async () => {
  await owner.goto(BASE + "/tickets/new"); await owner.getByLabel("Title").fill("Walk-in freezer down"); await owner.getByRole("button", { name: "Raise ticket" }).click(); await owner.getByText("Ticket raised.").waitFor();
  const r = await cron(); expect(r.sent >= 1, JSON.stringify(r)); const hit = received.find((x) => x.headers["x-nm-event"] === "ticket.created"); expect(hit, "receiver got nothing");
  expect(verify(secret, hit.body, hit.headers["x-nm-signature"]), "signature does not verify"); expect(!verify("wrong", hit.body, hit.headers["x-nm-signature"]), "verifies with the wrong secret");
  const p = JSON.parse(hit.body); expect(p.event === "ticket.created" && p.data.title === "Walk-in freezer down", hit.body);
});
await step("events that weren't subscribed aren't sent", async () => {
  const before = received.length; await addBranch(owner, "East", "EA1"); await cron(); expect(received.length === before, "a branch event leaked to a ticket-only webhook");
});
await step("a failing receiver is retried; the log shows the failure; Retry delivers it", async () => {
  mode = 500; await owner.goto(BASE + "/tickets/new"); await owner.getByLabel("Title").fill("Second ticket"); await owner.getByRole("button", { name: "Raise ticket" }).click(); await owner.getByText("Ticket raised.").waitFor();
  const r = await cron(); expect(r.failed === 1, JSON.stringify(r));
  await owner.goto(BASE + "/integrations"); await owner.getByText("The receiver answered 500").first().waitFor(); const [d] = await q("select attempts, status, next_attempt_at > now() later from webhook_deliveries where payload->'data'->>'title' = 'Second ticket'"); expect(d.status === "failed" && d.attempts === 1 && d.later, JSON.stringify(d));
  expect((await cron()).failed === 0, "retried before its backoff elapsed");
  mode = 200; await owner.locator("tr", { hasText: "ticket.created" }).filter({ hasText: "Failed" }).getByRole("button", { name: "Retry" }).click(); await owner.getByText("Queued to send again.").waitFor();
  const r2 = await cron(); expect(r2.sent === 1, JSON.stringify(r2)); await owner.goto(BASE + "/integrations"); await owner.locator("tr", { hasText: "Second ticket" }).count().catch(() => 0);
});
await step("a test event can be sent from the screen", async () => {
  await owner.getByRole("button", { name: "Send test" }).click(); await owner.getByText(/Test event queued/).waitFor(); await cron(); expect(received.some((x) => x.headers["x-nm-event"] === "ping"), "no ping received");
});
await step("a switched-off webhook receives nothing", async () => {
  await owner.getByRole("button", { name: "Switch off" }).click(); await owner.getByText("Webhook switched off.").waitFor(); const before = received.length;
  await owner.goto(BASE + "/tickets/new"); await owner.getByLabel("Title").fill("Third ticket"); await owner.getByRole("button", { name: "Raise ticket" }).click(); await owner.getByText("Ticket raised.").waitFor(); await cron(); expect(received.length === before, "delivered while off");
});
await step("the audit log records key and webhook changes without secrets", async () => {
  await owner.goto(BASE + "/audit"); await owner.getByRole("cell", { name: "Api keys" }).first().waitFor(); const html = await owner.content(); expect(!html.includes(secret) && !html.includes("whsec_"), "a secret appeared in the audit log");
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
server.close(); await browser.close(); process.exit(summary() ? 1 : 0);
