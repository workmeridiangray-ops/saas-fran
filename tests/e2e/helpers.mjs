import pg from "pg";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Use the project's Playwright if installed, otherwise the globally installed one.
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = createRequire(execSync("npm root -g").toString().trim() + "/")("playwright")); }

import { readFileSync } from "node:fs";
try { for (const l of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
export const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3100";
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const q = async (sql, p) => (await db.query(sql, p)).rows;

export async function open() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { browser, ctx, page, errors };
}
export async function newUser(browser) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); return { ctx, page: await ctx.newPage() }; }

let pass = 0; const failures = [];
export async function step(name, fn, page) {
  try { await fn(); pass++; console.log("  ok   " + name); }
  catch (e) {
    if (page) { try { await page.screenshot({ path: `/tmp/fail-${failures.length}.png` }); } catch {} }
    if (page) try { console.log("       [page] " + page.url() + " :: " + (await page.locator("main").innerText({ timeout: 2000 })).replace(/\s+/g, " ").slice(0, 260)); } catch {} failures.push(name); const m = String(e.message).split("\n").filter(Boolean).slice(0, 14).join("\n       "); console.log("  FAIL " + name + "\n       " + m); }
}
export function expect(cond, msg) { if (!cond) throw new Error(msg); }
export const summary = () => { console.log(`\n${pass} passed, ${failures.length} failed`); return failures.length; };

export async function lastMailLink(email, re = /https?:\/\/\S+/) {
  const rows = await q("select body from identity.outbox where to_email = $1 order by id desc limit 1", [email.toLowerCase()]);
  const m = rows[0]?.body.match(re); if (!m) throw new Error("no mail link for " + email);
  return m[0].replace(/[.)]+$/, "");
}
export async function signUpAndIn(page, email, name, password = "a long unusual passphrase") {
  await page.goto(BASE + "/signup");
  await page.getByLabel("Your name").fill(name); await page.getByLabel("Work email").fill(email); await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/verify/);
  const link = await lastMailLink(email, /http\S+verify\S+/);
  await page.goto(link); await page.getByRole("button", { name: "Confirm my email" }).click(); await page.waitForURL(/signin/);
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password); await page.getByRole("button", { name: "Sign in" }).click();
}

import { createHmac } from "node:crypto";
export const PW = "a long unusual passphrase";
export const uniq = (p) => `${p.toLowerCase()}+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

/** Sign in an existing account in this page. */
export async function signIn(page, email, password = PW) {
  await page.goto(BASE + "/signin"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
/** Sign up and sign in, then create a company. Returns when the dashboard is showing. */
export async function ownerWithCompany(page, email, name, company, model = "company_owned") {
  await signUpAndIn(page, email, name); await page.waitForURL(/onboarding/);
  await page.getByLabel("Company name").fill(company); await page.getByLabel("How does your network operate?").selectOption(model);
  await page.getByRole("button", { name: "Create workspace" }).click(); await page.waitForURL((u) => u.pathname === "/");
}
export async function addBranch(page, name, code, extra = async () => {}) {
  await page.goto(BASE + "/branches/new"); await page.getByLabel("Branch name").fill(name); await page.getByLabel("Code").fill(code); await extra();
  await page.getByRole("button", { name: "Add branch" }).click(); await page.waitForURL(/\/branches\/[0-9a-f-]{36}/);
  return page.url().split("?")[0].split("/").pop();
}
/** Invite from the owner's page; then a fresh browser context accepts it (signing up if needed). Returns { ctx, page }. */
export async function inviteAndJoin(ownerPage, browser, email, name, roleLabel) {
  await ownerPage.goto(BASE + "/people"); await ownerPage.getByLabel("Email").fill(email);
  await ownerPage.locator('form:has(button:has-text("Send invitation"))').getByLabel("Role").selectOption({ label: roleLabel });
  await ownerPage.getByRole("button", { name: "Send invitation" }).click(); await ownerPage.getByText(`Invitation sent to ${email}`).waitFor();
  const inviteUrl = await lastMailLink(email, /http\S+\/invite\/\S+/);
  const { ctx, page } = await newUser(browser);
  await page.goto(inviteUrl); await page.getByRole("link", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill(name); await page.getByLabel("Work email").fill(email); await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click(); await page.waitForURL(/verify/);
  await page.goto(await lastMailLink(email, /http\S+verify\S+/)); await page.getByRole("button", { name: "Confirm my email" }).click(); await page.waitForURL(/signin/);
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(PW); await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/invite/); await page.getByRole("button", { name: "Accept and open workspace" }).click(); await page.waitForURL((u) => u.pathname === "/");
  return { ctx, page };
}
export const money = (n) => (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// RFC 6238, for tests of two-factor sign-in.
export function totp(secret, at = Date.now()) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const out = [];
  for (const ch of secret) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

/** GET through the browser itself, so the (Secure, httpOnly) session cookie is sent exactly as in real use. */
export const fetchIn = (page, path) => page.evaluate(async (p) => {
  const r = await fetch(p); return { status: r.status, url: r.url, ct: r.headers.get("content-type"), text: await r.text() };
}, path);
