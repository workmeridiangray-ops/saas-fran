import { BASE, expect, open, ownerWithCompany, step, uniq, summary } from "./helpers.mjs";

console.log("Language: Spanish for menus, the shell, sign-in and the command centre");
const { browser, page, errors } = await open();
await step("sign-in is in English by default and offers Spanish", async () => {
  await page.goto(BASE + "/signin"); await page.getByRole("button", { name: "Sign in" }).waitFor(); expect(await page.locator("html").getAttribute("lang") === "en", "lang is not en");
});
await step("choosing Español translates the sign-in page and sets the page language", async () => {
  await page.getByRole("button", { name: "Español" }).click(); await page.getByRole("button", { name: "Iniciar sesión" }).waitFor(); await page.getByLabel("Contraseña").waitFor();
  expect(await page.locator("html").getAttribute("lang") === "es", "lang is not es");
});
await step("the choice survives a reload", async () => { await page.reload(); await page.getByRole("button", { name: "Iniciar sesión" }).waitFor(); });
await step("after sign-in the menu and command centre are in Spanish", async () => {
  await page.getByRole("button", { name: "English" }).click(); await page.getByRole("button", { name: "Sign in" }).waitFor();   // the helper signs up using English labels
  await ownerWithCompany(page, uniq("langowner"), "Lia Owner", `Lang Co ${Date.now()}`);
  await page.getByRole("button", { name: "Español" }).first().click(); await page.waitForLoadState("networkidle");
  await page.goto(BASE + "/"); await page.getByRole("heading", { name: "Centro de mando" }).waitFor();
  const nav = page.getByRole("navigation", { name: "Main" }); await nav.getByRole("link", { name: "Sucursales" }).waitFor(); await nav.getByRole("link", { name: "Aprobaciones" }).waitFor(); await nav.getByText("Operaciones").waitFor();
});
await step("untranslated screens stay readable in English instead of breaking", async () => {
  await page.goto(BASE + "/branches"); await page.getByRole("heading", { name: "Sucursales" }).waitFor(); await page.getByText(/No branches yet|Add branch|Add your first/i).first().waitFor();
});
await step("switching back restores English everywhere", async () => {
  await page.getByRole("button", { name: "English" }).first().click(); await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Branches" }).waitFor(); expect(await page.locator("html").getAttribute("lang") === "en", "lang not en");
});
await step("a made-up language value is ignored", async () => {
  await page.context().addCookies([{ name: "nm_lang", value: "xx", url: BASE }]); await page.goto(BASE + "/signin"); expect(await page.locator("html").getAttribute("lang") === "en", "bad cookie accepted");
});
await step("no browser errors", async () => expect(errors.length === 0, errors.join(" | ")));
await browser.close(); process.exit(summary() ? 1 : 0);
