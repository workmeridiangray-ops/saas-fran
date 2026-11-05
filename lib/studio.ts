import type { Db } from "@/lib/db";
import type { Entity, FieldDef } from "@/lib/rules/studio";

export async function loadFields(db: Db, companyId: string, entity: Entity): Promise<FieldDef[]> {
  return db.q<FieldDef>("select key, label, kind, options, required from custom_fields where company_id = $1 and entity = $2 and not archived order by position, created_at", [companyId, entity]);
}
