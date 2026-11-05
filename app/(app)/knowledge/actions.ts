"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";

export async function createDocument(f: FormData) {
  const ctx = await requireCtx();
  return run("/knowledge/new", "/knowledge", "Draft saved.", async () => {
    const title = str(f, "title"), body = str(f, "body"); const kind = ["sop", "policy", "template"].includes(str(f, "kind")) ? str(f, "kind") : "sop";
    if (title.length < 3) fail("Give the document a title."); if (body.length < 5) fail("Write the document's content.");
    const id = await asUser(ctx.user.id, async (db) => {
      const doc = (await db.one<{ id: string }>("insert into documents(company_id, title, kind, created_by, expires_on) values ($1,$2,$3,$4,$5) returning id", [ctx.companyId, title, kind, ctx.user.id, str(f, "expires_on") || null]))!.id;
      await db.q("insert into document_versions(company_id, document_id, version, body, created_by) values ($1,$2,1,$3,$4)", [ctx.companyId, doc, body, ctx.user.id]);
      await db.q("update documents set current_version = 1 where id = $1", [doc]);
      return doc;
    });
    return `/knowledge/${id}`;
  });
}

/** Saving edits creates a new version; the published one stays live until the new one is published. */
export async function saveVersion(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/knowledge/${id}`, `/knowledge/${id}`, "New draft version saved. The published version is unchanged until you publish.", async () => {
    const body = str(f, "body"); if (body.length < 5) fail("Write the document's content.");
    await asUser(ctx.user.id, async (db) => {
      const cur = await db.one<{ v: number }>("select coalesce(max(version),0) v from document_versions where document_id = $1", [id]);
      await db.q("insert into document_versions(company_id, document_id, version, body, created_by) values ($1,$2,$3,$4,$5)", [ctx.companyId, id, cur!.v + 1, body, ctx.user.id]);
    });
  });
}

export async function publishVersion(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), version = Number(str(f, "version"));
  return run(`/knowledge/${id}`, `/knowledge/${id}`, "Published. Everyone has been asked to read and acknowledge it.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const v = await db.one("select 1 from document_versions where document_id = $1 and version = $2", [id, version]);
      if (!v) fail("That version wasn't found.");
      await db.q("update document_versions set published = true where document_id = $1 and version = $2", [id, version]);
      await db.q("update documents set status = 'published', current_version = $2 where id = $1", [id, version]);
      const doc = (await db.one<{ title: string }>("select title from documents where id = $1", [id]))!;
      await db.q(`insert into notifications(company_id, user_id, title, body, href) select $1, user_id, $2, 'Please read and acknowledge the new version.', $3 from memberships where company_id = $1 and status = 'active' and user_id <> $4`, [ctx.companyId, `Updated: ${doc.title}`, `/knowledge/${id}`, ctx.user.id]);
    });
  });
}
export async function archiveDocument(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/knowledge/${id}`, "/knowledge", "Document archived. It stays on record but no longer asks for acknowledgement.", async () => {
    await asUser(ctx.user.id, (db) => db.q("update documents set status = 'archived' where id = $1", [id]));
  });
}
export async function acknowledge(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"), version = Number(str(f, "version"));
  return run(`/knowledge/${id}`, `/knowledge/${id}`, "Thanks. Your acknowledgement is recorded.", async () => {
    await asUser(ctx.user.id, async (db) => {
      const d = await db.one<{ current_version: number; status: string }>("select current_version, status from documents where id = $1", [id]);
      if (!d || d.status !== "published" || d.current_version !== version) fail("A newer version was published. Read it and acknowledge that one.");
      await db.q("insert into acknowledgements(company_id, document_id, version, user_id) values ($1,$2,$3,$4) on conflict do nothing", [ctx.companyId, id, version, ctx.user.id]);
    });
  });
}
