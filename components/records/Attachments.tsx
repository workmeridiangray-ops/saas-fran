import { FileText } from "lucide-react";
import { asUser } from "@/lib/db";
import type { Ctx } from "@/lib/ctx";
import { uploadAttachment } from "./actions";
import { SubmitButton } from "@/components/ui/forms";
import { Panel } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

/** Files attached to a record. Visibility is enforced by the database through the parent record's access. */
export async function Attachments({ ctx, table, id, back, canUpload = true, title = "Evidence and files" }: { ctx: Ctx; table: string; id: string; back: string; canUpload?: boolean; title?: string }) {
  const files = await asUser(ctx.user.id, (db) => db.q<{ id: string; filename: string; size_bytes: number; created_at: string; who: string | null }>(
    "select a.id, a.filename, a.size_bytes, a.created_at, coalesce(nullif(p.display_name,''), p.email) who from attachments a left join profiles p on p.id = a.uploaded_by where a.subject_table = $1 and a.subject_id = $2 order by a.created_at", [table, id]));
  return (
    <Panel title={title}>
      {files.length === 0 ? <p className="text-sm text-muted">Nothing attached yet.</p> : (
        <ul className="grid gap-1 sm:grid-cols-2">{files.map((f) => (
          <li key={f.id}><a href={`/api/files/${f.id}`} className="flex min-h-touch items-center gap-1 rounded-md border border-line px-1.5 text-sm hover:bg-sunken"><FileText aria-hidden size={16} className="shrink-0 text-muted" />
            <span className="min-w-0"><span className="block truncate">{f.filename}</span><span className="block text-xs text-muted">{(f.size_bytes / 1024).toFixed(0)} KB · {f.who ?? "—"} · {fmtDateTime(f.created_at, ctx.company.timezone)}</span></span></a></li>))}</ul>)}
      {canUpload && (
        <form action={uploadAttachment} encType="multipart/form-data" className="mt-2 flex flex-wrap items-end gap-1">
          <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} />
          <div><label htmlFor={`file-${id}`} className="mb-0.5 block text-xs font-medium text-muted">Attach a file (up to 5 MB)</label><input id={`file-${id}`} type="file" name="file" required className="block text-sm" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.docx,.xlsx" /></div>
          <SubmitButton variant="secondary" pending="Uploading…">Attach</SubmitButton>
        </form>)}
    </Panel>
  );
}
