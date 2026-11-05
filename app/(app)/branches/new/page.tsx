import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createBranch } from "../actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui";
import { loadFields } from "@/lib/studio";
import { CustomFields } from "@/components/studio/CustomFields";

export const metadata = { title: "Add branch" };

export default async function NewBranch({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "branches", { action: "create", what: "adding branches" }); if (denied) return denied;
  const { err } = await searchParams;
  const o = await asUser(ctx.user.id, async (db) => ({
    brands: await db.q<{ id: string; name: string }>("select id, name from brands where company_id=$1 and status='active' order by name", [ctx.companyId]),
    regions: await db.q<{ id: string; name: string }>("select id, name from regions where company_id=$1 and status='active' order by name", [ctx.companyId]),
    entities: await db.q<{ id: string; name: string }>("select id, name from legal_entities where company_id=$1 and status='active' order by name", [ctx.companyId]),
    partners: await db.q<{ id: string; name: string }>("select id, name from franchise_partners where company_id=$1 and status='active' order by name", [ctx.companyId]),
    defs: await loadFields(db, ctx.companyId, "branches"),
  }));
  const pick = (r: { id: string; name: string }[]) => r.map((x) => ({ value: x.id, label: x.name }));
  const upgrade = err?.includes("plan limit");
  return (
    <>
      <PageHeader title="Add branch" description="Brands, regions and partners are optional. Add them under Organisation when you need them." />
      <Flash err={err} />
      {upgrade && <p className="mb-2 text-sm"><Link href="/billing" className="font-medium text-brand">See plans and upgrade</Link></p>}
      <FormCard>
        <form action={createBranch} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2"><Field label="Branch name" name="name" required /><Field label="Code" name="code" required hint="Short and unique, for example DT1." maxLength={12} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select label="Brand" name="brand_id" options={pick(o.brands)} placeholder="None" />
            <Select label="Region" name="region_id" options={pick(o.regions)} placeholder="None" />
            <Select label="Legal entity" name="legal_entity_id" options={pick(o.entities)} placeholder="None" />
            <Select label="Status" name="status" options={[{ value: "active", label: "Active (open now)" }, { value: "opening", label: "Opening (being set up)" }]} />
          </div>
          {ctx.company.operatingModel !== "company_owned" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select label="Ownership" name="ownership" options={[{ value: "company", label: "Company-owned" }, { value: "franchise", label: "Franchise" }]} />
              <Select label="Franchise partner" name="partner_id" options={pick(o.partners)} placeholder="Only for franchises" hint="Add partners under Organisation first." />
            </div>
          )}
          <Field label="Time zone" name="timezone" defaultValue={ctx.company.timezone} hint="Task and checklist deadlines use this zone." />
          <Field label="Address" name="address" /><Field label="Phone" name="phone" type="tel" />
          <CustomFields defs={o.defs} />
          <div className="flex gap-1"><SubmitButton pending="Adding…">Add branch</SubmitButton><Link href="/branches" className="inline-flex min-h-touch items-center px-2 text-sm font-medium text-brand">Cancel</Link></div>
        </form>
      </FormCard>
    </>
  );
}
