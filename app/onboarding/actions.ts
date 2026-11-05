"use server";
import { asUser } from "@/lib/db";
import { fail, run, str } from "@/lib/flash";
import { randomToken } from "@/lib/auth/password";
import { requireUser, setWorkspace } from "@/lib/auth/session";

const MODELS = ["company_owned", "franchise", "mixed", "internal", "service_network"];
export async function createCompany(f: FormData) {
  const u = await requireUser();
  const name = str(f, "name"), model = str(f, "model"), industry = str(f, "industry") || "general";
  const country = str(f, "country").toUpperCase() || "US", currency = str(f, "currency").toUpperCase() || "USD", tz = str(f, "timezone") || "UTC";
  return run("/onboarding", "/", "Your workspace is ready. Start with the checklist below.", async () => {
    if (name.length < 2) fail("Enter your company name.");
    if (!MODELS.includes(model)) fail("Choose how your network operates.");
    if (!/^[A-Z]{3}$/.test(currency)) fail("Enter a 3-letter currency code, such as USD.");
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { fail("That time zone isn't recognised."); }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "company";
    const slug = `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 4)}`;
    const id = await asUser(u.id, async (db) => (await db.one<{ id: string }>("select public.create_company($1,$2,$3,$4,$5,$6,$7) as id", [name, slug, model, industry, country, currency, tz]))!.id);
    await setWorkspace(id);
  });
}
