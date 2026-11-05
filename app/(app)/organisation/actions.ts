"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";

const TABLES = { brands: "brands", regions: "regions", entities: "legal_entities", departments: "departments", partners: "franchise_partners" } as const;
type Kind = keyof typeof TABLES;
const kindOf = (f: FormData): Kind => { const k = str(f, "kind") as Kind; if (!(k in TABLES)) fail("Unknown item type."); return k; };

export async function addOrgItem(f: FormData) {
  const ctx = await requireCtx(); const kind = kindOf(f); const name = str(f, "name");
  return run("/organisation", "/organisation", `${name} added.`, async () => {
    if (name.length < 2) fail("Enter a name.");
    await asUser(ctx.user.id, (db) => kind === "partners"
      ? db.q("insert into franchise_partners(company_id, name, stage) values ($1,$2,$3)", [ctx.companyId, name, str(f, "stage") || "prospect"])
      : db.q(`insert into ${TABLES[kind]}(company_id, name) values ($1,$2)`, [ctx.companyId, name]));
  });
}
export async function toggleOrgItem(f: FormData) {
  const ctx = await requireCtx(); const kind = kindOf(f); const id = uuid(f, "id");
  return run("/organisation", "/organisation", "Updated.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const n = await db.q(`update ${TABLES[kind]} set status = case status when 'active' then 'archived' else 'active' end where id = $1 returning id`, [id]);
      if (n.length === 0) fail("You can't change that.");
    });
  });
}
export async function setPartnerStage(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const stage = str(f, "stage");
  return run("/organisation", "/organisation", "Partner stage updated.", async () => {
    if (!["prospect", "approved", "active", "renewing", "terminated"].includes(stage)) fail("Unknown stage.");
    await asUser(ctx.user.id, (db) => db.q("update franchise_partners set stage = $2 where id = $1", [id, stage]));
  });
}
