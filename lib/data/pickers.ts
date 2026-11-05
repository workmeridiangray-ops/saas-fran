import type { Db } from "@/lib/db";
export const branchOptions = (db: Db, companyId: string) => db.q<{ id: string; name: string; timezone: string }>("select id, name, timezone from branches where company_id = $1 and status in ('active','opening','suspended') order by name", [companyId]);
/** Colleagues for assignment pickers. Goes through a narrow function so people without "view users" can still assign work. */
export const memberOptions = (db: Db, companyId: string) => db.q<{ user_id: string; name: string }>("select user_id, name from public.company_people($1)", [companyId]);
