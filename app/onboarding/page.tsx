import { requireUser } from "@/lib/auth/session";
import { createCompany } from "./actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";

export const metadata = { title: "Create your workspace" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireUser(); const { err } = await searchParams;
  return (
    <main className="mx-auto max-w-form space-y-2 p-3 pt-6">
      <h1 className="text-2xl font-semibold">Create your workspace</h1>
      <p className="text-sm text-muted">One workspace per company. You get a 14-day trial of the Growth plan, with starter roles, approval rules and checklists already set up. You can change everything later.</p>
      <Flash err={err} />
      <FormCard>
        <form action={createCompany} className="space-y-2">
          <Field label="Company name" name="name" required autoComplete="organization" />
          <Select label="How does your network operate?" name="model" required defaultValue="company_owned" options={[
            { value: "company_owned", label: "Company-owned branches" }, { value: "franchise", label: "Franchises" },
            { value: "mixed", label: "Mixed: owned and franchised" }, { value: "internal", label: "Private internal operations" }, { value: "service_network", label: "Service network" }]} />
          <Select label="Industry" name="industry" defaultValue="restaurants" options={[
            { value: "restaurants", label: "Restaurants and food" }, { value: "printing", label: "Printing" }, { value: "retail", label: "Retail" },
            { value: "education", label: "Education" }, { value: "services", label: "Services" }, { value: "general", label: "Other" }]} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Country (2 letters)" name="country" defaultValue="US" maxLength={2} required />
            <Field label="Currency" name="currency" defaultValue="USD" maxLength={3} required hint="Used for money across the workspace." />
          </div>
          <Field label="Time zone" name="timezone" defaultValue="America/New_York" required hint="Branch deadlines can use their own time zone." />
          <SubmitButton className="w-full" pending="Creating…">Create workspace</SubmitButton>
        </form>
      </FormCard>
    </main>
  );
}
