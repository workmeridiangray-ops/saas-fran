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
export async function step(name, fn) {
  try { await fn(); pass++; console.log("  ok   " + name); }
  catch (e) { failures.push(name); console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
export function expect(cond, msg) { if (!cond) throw new Error(msg); }
export const summary = () => { console.log(`\n${pass} passed, ${failures.length} failed`); return failures.length; };

export async function lastMailLink(email, re = /https?:\/\/\S+/) {
  const rows = await q("select body from identity.outbox where to_email = $1 order by id desc limit 1", [email]);
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
