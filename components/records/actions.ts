"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { checkUpload } from "@/lib/files";

export async function uploadAttachment(f: FormData) {
  const ctx = await requireCtx(); const table = str(f, "table"), id = uuid(f, "id"), back = str(f, "back");
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  return run(safeBack, safeBack, "File attached.", async () => {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) fail("Choose a file to attach.");
    const bytes = new Uint8Array(await (file as File).arrayBuffer());
    const chk = checkUpload((file as File).name, bytes); if (!chk.ok) fail(chk.error);
    if (chk.ok) await asUser(ctx.user.id, (db) => db.q(
      "insert into attachments(company_id, subject_table, subject_id, filename, content_type, size_bytes, data, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [ctx.companyId, table, id, chk.safeName, chk.type, bytes.length, Buffer.from(bytes), ctx.user.id]));
  });
}
