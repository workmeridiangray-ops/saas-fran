import { redirect } from "next/navigation";
import { asService } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export type StaffRole = "super_admin" | "billing" | "support" | "technical";
/** Platform staff are SaaS operators, not customers. Every action here is audited against their user id. */
export async function requireStaff(allowed: StaffRole[] = ["super_admin", "billing", "support", "technical"]) {
  const user = await requireUser();
  const row = await asService((db) => db.one<{ role: StaffRole }>("select role from platform_staff where user_id = $1", [user.id]));
  if (!row || !(allowed.includes(row.role) || row.role === "super_admin")) redirect("/");
  return { user, role: row.role };
}
export async function platformAudit(db: { q: (sql: string, p?: unknown[]) => Promise<unknown[]> }, actor: string, companyId: string | null, table: string, op: string, rowId: string) {
  await db.q("insert into audit_log(company_id, actor, table_name, op, row_id, changed_fields) values ($1,$2,$3,$4,$5,'{platform}')", [companyId, actor, table, op, rowId]);
}
