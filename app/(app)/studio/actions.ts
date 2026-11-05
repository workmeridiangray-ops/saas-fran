"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { ENTITIES, KINDS, keyFromLabel, parseOptions, type Entity, type Kind } from "@/lib/rules/studio";

export async function addField(f: FormData) {
  const ctx = await requireCtx();
  return run("/studio", "/studio", "Field added.", async () => {
    if (!ctx.has("configure", "studio")) fail("You don't have permission to change the configuration.");
    const entity = str(f, "entity") as Entity, kind = str(f, "kind") as Kind, label = str(f, "label");
    if (!ENTITIES.includes(entity) || !KINDS.includes(kind)) fail("Choose where the field goes and what type it is.");
    if (label.length < 2) fail("Give the field a name.");
    const options = kind === "select" ? parseOptions(str(f, "options")) : [];
    if (kind === "select" && options.length < 2) fail("A list field needs at least two options, separated by commas or new lines.");
    await asUser(ctx.user.id, async (db) => {
      const pos = (await db.one<{ n: string }>("select coalesce(max(position), 0) + 1 n from custom_fields where company_id = $1 and entity = $2", [ctx.companyId, entity]))!.n;
      await db.q("insert into custom_fields(company_id, entity, key, label, kind, options, required, position) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [ctx.companyId, entity, keyFromLabel(label), label, kind, options, f.get("required") === "on" && kind !== "checkbox", Number(pos)]);
    });
  });
}

export async function setFieldArchived(f: FormData, archived: boolean) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/studio", "/studio", archived ? "Field archived. Existing values are kept." : "Field restored.", async () => {
    if (!ctx.has("configure", "studio")) fail("You don't have permission to change the configuration.");
    const n = await asUser(ctx.user.id, (db) => db.q("update custom_fields set archived = $2 where id = $1 returning id", [id, archived]));
    if (n.length === 0) fail("That field wasn't found.");
  });
}
export async function archiveField(f: FormData) { return setFieldArchived(f, true); }
export async function restoreField(f: FormData) { return setFieldArchived(f, false); }

export async function addOptions(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/studio", "/studio", "Options added.", async () => {
    if (!ctx.has("configure", "studio")) fail("You don't have permission to change the configuration.");
    const add = parseOptions(str(f, "options")); if (add.length === 0) fail("Type at least one new option.");
    await asUser(ctx.user.id, async (db) => {
      const cur = await db.one<{ options: string[] }>("select options from custom_fields where id = $1 and kind = 'select'", [id]); if (!cur) fail("That field wasn't found.");
      await db.q("update custom_fields set options = $2 where id = $1", [id, [...new Set([...cur!.options, ...add])]]);
    });
  });
}

const TERMS = ["branch", "task", "ticket"] as const;
export async function saveTerms(f: FormData) {
  const ctx = await requireCtx();
  return run("/studio", "/studio", "Terminology saved.", async () => {
    if (!ctx.has("configure", "studio")) fail("You don't have permission to change the configuration.");
    await asUser(ctx.user.id, async (db) => {
      for (const t of TERMS) {
        const s = str(f, `${t}_singular`), p = str(f, `${t}_plural`);
        if (!s && !p) { await db.q("delete from terminology where company_id = $1 and term = $2", [ctx.companyId, t]); continue; }
        if (s.length < 2 || p.length < 2) fail(`Give both the singular and plural for "${t}", or clear both to use the default.`);
        await db.q("insert into terminology(company_id, term, singular, plural) values ($1,$2,$3,$4) on conflict (company_id, term) do update set singular = $3, plural = $4", [ctx.companyId, t, s, p]);
      }
    });
  });
}
