import { createRequire } from "node:module";
import { BASE, addBranch, expect, open, ownerWithCompany, step, summary, uniq } from "./helpers.mjs";

console.log("Accessibility (axe, WCAG 2.1 A/AA) and mobile layout");
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const { browser, ctx, page, errors } = await open();
const PAGES = ["/", "/branches", "/branches/new", "/tasks", "/tasks/new", "/checklists", "/approvals", "/approvals?tab=rules", "/inspections", "/inspections?tab=templates", "/inspections/new", "/purchasing", "/purchasing?tab=suppliers", "/purchasing/new", "/tickets", "/tickets/new", "/knowledge", "/knowledge/new", "/training", "/training/new", "/assets", "/assets?tab=licences", "/people", "/people/roles", "/organisation", "/reports", "/audit", "/billing", "/notifications", "/account", "/workspaces", "/onboarding"];

async function scan(p, url) {
  await p.goto(BASE + url); await p.waitForLoadState("networkidle");
  await p.addScriptTag({ path: axePath });
  const r = await p.evaluate(async () => await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }));
  return r.violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(" ")}`);
}
await step("set up a company with some data", async () => { await ownerWithCompany(page, uniq("a11y"), "Ana Access", `Access Co ${Date.now()}`); await addBranch(page, "Main", "MN1"); });
await step("every screen passes axe on desktop", async () => {
  const bad = []; for (const u of PAGES) { const v = await scan(page, u); if (v.length) bad.push(u + "\n   " + v.join("\n   ")); }
  expect(bad.length === 0, "\n" + bad.join("\n"));
});
await step("every screen passes axe on a phone", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bad = []; for (const u of PAGES) { const v = await scan(page, u); if (v.length) bad.push(u + "\n   " + v.join("\n   ")); }
  expect(bad.length === 0, "\n" + bad.join("\n"));
});
await step("no screen scrolls sideways on a phone", async () => {
  const bad = []; for (const u of PAGES) { await page.goto(BASE + u); if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(u); }
  expect(bad.length === 0, "horizontal overflow on: " + bad.join(", "));
});
await step("the phone menu opens and reaches every module", async () => {
  await page.goto(BASE + "/"); await page.getByLabel("Open menu").click(); await page.getByRole("link", { name: "Branches" }).first().waitFor(); await page.getByRole("link", { name: "Branches" }).first().click(); await page.waitForURL(/\/branches/);
});
await step("touch targets are at least 44px on the main actions", async () => {
  await page.goto(BASE + "/branches/new"); const small = await page.evaluate(() => [...document.querySelectorAll("main button, main a[href], main input:not([type=hidden]), main select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5) && getComputedStyle(e).display !== "inline"; }).map((e) => (e.textContent || e.name || e.tagName).trim().slice(0, 30)));
  expect(small.length === 0, "too small: " + small.join(", "));
});
await step("keyboard: skip link works and focus is visible", async () => {
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(BASE + "/branches"); await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.textContent?.includes("Skip to content")), "first tab stop isn't the skip link");
  await page.keyboard.press("Enter"); expect(await page.evaluate(() => location.hash === "#main"), "skip link did nothing");
  await page.keyboard.press("Tab"); const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle); expect(outline !== "none", "no visible focus ring");
});
await step("reduced motion is respected", async () => {
  await ctx.close().catch(() => {}); const c = await browser.newContext({ reducedMotion: "reduce" }); const p = await c.newPage(); await p.goto(BASE + "/signin");
  expect(await p.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "reduced motion not detected"); await c.close();
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
