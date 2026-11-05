"use server";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db";

/** Public franchise enquiry. No account needed, so it is defended: honeypot, length limits, per-address and per-company rate limits. */
export async function submitEnquiry(f: FormData) {
  const slug = String(f.get("slug") ?? ""); const base = `/apply/${encodeURIComponent(slug)}`;
  const name = String(f.get("name") ?? "").trim().slice(0, 120), email = String(f.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const phone = String(f.get("phone") ?? "").trim().slice(0, 40), message = String(f.get("message") ?? "").trim().slice(0, 2000);
  if (String(f.get("website") ?? "") !== "") redirect(`${base}?sent=1`);      // honeypot: look successful to bots
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`${base}?err=${encodeURIComponent("Enter your name and a valid email address.")}`);
  const result = await asService(async (db) => {
    const c = await db.one<{ id: string; ok: boolean }>("select c.id, (c.status in ('trial','active','past_due') and 'franchise' = any (coalesce((select modules from app.current_plan(c.id)), '{}'))) ok from companies c where c.slug = $1", [slug]);
    if (!c || !c.ok) return "closed";
    const recent = await db.one<{ mine: string; all: string }>("select count(*) filter (where email = $2) mine, count(*) all from applicants where company_id = $1 and source = 'website' and created_at > now() - interval '1 hour'", [c.id, email]);
    if (Number(recent!.mine) >= 2 || Number(recent!.all) >= 40) return "limit";
    const a = await db.one<{ id: string }>("insert into applicants(company_id, name, email, phone, source, notes) values ($1,$2,$3,$4,'website',$5) returning id", [c.id, name, email, phone, message]);
    await db.q(`insert into notifications(company_id, user_id, title, body, href) select $1, m.user_id, 'New franchise enquiry: ' || $2::text, $3::text, '/franchise/' || $4::text from memberships m join membership_roles mr on mr.membership_id = m.id join roles r on r.id = mr.role_id where m.company_id = $1 and m.status = 'active' and r.name = 'Company owner'`, [c.id, name, email, a!.id]);
    return "ok";
  });
  if (result === "limit") redirect(`${base}?err=${encodeURIComponent("We've already received your enquiry. We'll be in touch.")}`);
  if (result === "closed") redirect(`${base}?err=${encodeURIComponent("This page isn't accepting enquiries right now.")}`);
  redirect(`${base}?sent=1`);
}
