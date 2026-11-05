import { asUser } from "@/lib/db";
import { loadFields } from "@/lib/studio";
import { showValue, ENTITIES, type CustomValues, type Entity } from "@/lib/rules/studio";
import { Panel } from "@/components/ui";

/** Read-only display of a record's company-defined fields. Renders nothing when the company defined none. */
export async function CustomValuesList({ entity, id, userId, companyId }: { entity: Entity; id: string; userId: string; companyId: string }) {
  if (!ENTITIES.includes(entity)) return null;
  const d = await asUser(userId, async (db) => ({ defs: await loadFields(db, companyId, entity), row: await db.one<{ custom: CustomValues }>(`select custom from ${entity} where id = $1`, [id]) }));
  if (d.defs.length === 0 || !d.row) return null;
  return (
    <Panel title="Additional details">
      <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
        {d.defs.map((f) => <div key={f.key}><dt className="text-xs text-muted">{f.label}</dt><dd className="text-sm">{showValue(f, d.row!.custom[f.key])}</dd></div>)}
      </dl>
    </Panel>
  );
}
