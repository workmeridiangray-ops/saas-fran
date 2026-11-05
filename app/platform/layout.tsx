import Link from "next/link";
import { requireStaff } from "@/lib/platform";

export const dynamic = "force-dynamic";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface"><div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3 px-3 py-1">
        <strong className="text-sm text-brand">Platform admin</strong>
        <nav aria-label="Platform" className="flex flex-wrap gap-1">{[["/platform", "Overview"], ["/platform/companies", "Companies"], ["/platform/invoices", "Invoices"], ["/platform/plans", "Plans"]].map(([h, l]) => <Link key={h} href={h!} className="inline-flex min-h-touch items-center rounded-md px-1.5 text-sm hover:bg-sunken">{l}</Link>)}</nav>
        <span className="ml-auto text-xs text-muted">{staff.user.email} · {staff.role.replace("_", " ")} · <Link className="text-brand" href="/">Back to your workspace</Link></span></div></header>
      <main className="mx-auto max-w-[90rem] p-3">{children}</main>
    </div>
  );
}
