import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addField, addOptions, archiveField, restoreField, saveTerms } from "./actions";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { ENTITIES, ENTITY_LABEL, KINDS, KIND_LABEL, type Entity, type Kind } from "@/lib/rules/studio";

export const metadata = { title: "Configuration studio" };
interface Row { id: string; entity: Entity; key: string; label: string; kind: Kind; options: string[]; required: boolean; archived: boolean }
const DEFAULTS = { branch: ["Branch", "Branches"], task: ["Task", "Tasks"], ticket: ["Ticket", "Tickets"] } as const;

export default async function Studio({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "studio", { what: "the configuration studio" }); if (denied) return denied;
  const { ok, err } = await searchParams; const canEdit = ctx.has("configure", "studio");
  const d = await asUser(ctx.user.id, async (db) => ({
    fields: await db.q<Row>("select id, entity, key, label, kind, options, required, archived from custom_fields where company_id = $1 order by entity, position, created_at", [ctx.companyId]),
    terms: await db.q<{ term: keyof typeof DEFAULTS; singular: string; plural: string }>("select term, singular, plural from terminology where company_id = $1", [ctx.companyId]),
  }));
  const term = (t: keyof typeof DEFAULTS) => d.terms.find((x) => x.term === t);
  return (
    <>
      <PageHeader title="Configuration studio" description="Add your own fields to branches, tasks and tickets, and rename the words the app uses. Changes apply to everyone in this company straight away." />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Your fields">
          {d.fields.length === 0 ? <p className="text-sm text-muted">No custom fields yet. Add one on the right; it appears on the matching form straight away.</p> : (
            <TableWrap label="Custom fields">
              <thead><tr><Th>Field</Th><Th>On</Th><Th>Type</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>{d.fields.map((f) => (
                <tr key={f.id}>
                  <Td>{f.label}{f.required && <span className="text-danger"> *</span>}{f.archived && <span className="ml-1 text-xs text-muted">(archived)</span>}
                    {f.kind === "select" && <div className="text-xs text-muted">{f.options.join(", ")}</div>}</Td>
                  <Td>{ENTITY_LABEL[f.entity]}</Td><Td>{KIND_LABEL[f.kind]}</Td>
                  <Td>{canEdit && (
                    <form className="flex items-center gap-1"><input type="hidden" name="id" value={f.id} />
                      {f.archived ? <button formAction={restoreField} className="text-sm font-medium text-brand">Restore</button> : <button formAction={archiveField} className="text-sm font-medium text-brand">Archive</button>}
                    </form>)}
                    {canEdit && f.kind === "select" && !f.archived && (
                      <form action={addOptions} className="mt-1 flex items-end gap-1"><input type="hidden" name="id" value={f.id} />
                        <input name="options" aria-label={`New options for ${f.label}`} placeholder="Add options" className="min-h-touch w-28 rounded-md border border-line-strong bg-surface px-1 text-sm" />
                        <button className="min-h-touch text-sm font-medium text-brand">Add</button></form>)}
                  </Td>
                </tr>))}</tbody>
            </TableWrap>)}
          <p className="mt-1 text-xs text-muted">A field&apos;s name, type and place can&apos;t change once added. Archive it and add a new one. Archiving hides it but keeps the values already saved.</p>
        </Panel>
        {canEdit && (
          <FormCard title="Add a field">
            <form action={addField} className="space-y-2">
              <Select label="Add it to" name="entity" options={ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))} />
              <Field label="Field name" name="label" required maxLength={60} hint="For example Seating capacity or Lease end date." />
              <Select label="Type" name="kind" options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
              <TextArea label="Options (for list fields)" name="options" rows={2} hint="Separate with commas or new lines." />
              <label className="flex min-h-touch items-center gap-1.5 text-sm"><input type="checkbox" name="required" className="h-2 w-2" />Required</label>
              <SubmitButton pending="Adding…">Add field</SubmitButton>
            </form>
          </FormCard>)}
      </div>
      {canEdit && (
        <FormCard title="Terminology" className="mt-3">
          <p className="text-sm text-muted">Use your own words in menus and headings. Leave both boxes empty to keep the default.</p>
          <form action={saveTerms} className="space-y-2">
            {(Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).map((t) => (
              <div key={t} className="grid gap-2 sm:grid-cols-2">
                <Field label={`${DEFAULTS[t][0]} (singular)`} name={`${t}_singular`} defaultValue={term(t)?.singular ?? ""} placeholder={DEFAULTS[t][0]} maxLength={30} />
                <Field label={`${DEFAULTS[t][0]} (plural)`} name={`${t}_plural`} defaultValue={term(t)?.plural ?? ""} placeholder={DEFAULTS[t][1]} maxLength={30} />
              </div>))}
            <SubmitButton pending="Saving…">Save terminology</SubmitButton>
          </form>
        </FormCard>)}
    </>
  );
}
