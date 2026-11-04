import Link from "next/link";
import {
  Bell, BookOpen, Box, CheckSquare, ChartColumn, ClipboardCheck, Coins, CreditCard, GraduationCap,
  Handshake, LayoutDashboard, LifeBuoy, ListChecks, Plug, Search, ShoppingCart, SlidersHorizontal,
  Store, Users, Wrench, ChevronsUpDown, type LucideIcon,
} from "lucide-react";
import { NAV } from "@/lib/nav";
import { visibleResources } from "@/lib/rules/permissions";
import { company, me, usage } from "@/lib/demo/data";

const ICONS: Record<string, LucideIcon> = {
  layout: LayoutDashboard, check: CheckSquare, list: ListChecks, clipboard: ClipboardCheck, book: BookOpen,
  life: LifeBuoy, store: Store, handshake: Handshake, wrench: Wrench, users: Users, cap: GraduationCap,
  cart: ShoppingCart, box: Box, coins: Coins, chart: ChartColumn, card: CreditCard, sliders: SlidersHorizontal, plug: Plug,
};

export function Shell({ children }: { children: React.ReactNode }) {
  // Nav shows a module only if the role can view it AND the plan includes it.
  const allowed = new Set(visibleResources(me));
  const enabled = new Set(usage.enabledModules);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => allowed.has(i.resource) && (!i.module || enabled.has(i.module))),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-2">Skip to content</a>
      <aside aria-label="Primary" className="hidden w-[15rem] shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-2">
          <Link href="/workspaces" className="mb-3 flex min-h-touch items-center justify-between gap-1 rounded-md border border-line bg-canvas px-2 hover:bg-sunken" aria-label={`Workspace: ${company.name}. Switch workspace`}>
            <span className="min-w-0">
              <span className="block text-xs text-muted">Workspace</span>
              <span className="block truncate text-sm font-semibold">{company.name}</span>
            </span>
            <ChevronsUpDown aria-hidden size={16} className="shrink-0 text-muted" />
          </Link>
          <nav aria-label="Main" className="space-y-3">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="px-1 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</p>
                <ul>
                  {g.items.map((i) => {
                    const Icon = ICONS[i.icon] ?? LayoutDashboard;
                    return (
                      <li key={i.href}>
                        <Link href={i.href} className="flex min-h-touch items-center gap-1.5 rounded-md px-1.5 text-sm text-ink hover:bg-sunken">
                          <Icon aria-hidden size={16} className="text-muted" />
                          {i.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 flex min-h-[3.5rem] items-center gap-2 border-b border-line bg-surface px-2 lg:px-3">
          <div className="min-w-0 lg:hidden">
            <p className="truncate text-sm font-semibold">{company.name}</p>
          </div>
          <form role="search" action="/branches" className="relative hidden max-w-form flex-1 sm:block">
            <label htmlFor="global-search" className="sr-only">Search branches, records and documents</label>
            <Search aria-hidden size={16} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-muted" />
            <input id="global-search" name="q" placeholder="Search branches, records, documents" className="min-h-touch w-full rounded-md border border-line bg-canvas pl-4 pr-1.5 text-sm placeholder:text-muted" />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <span title="Records you see are limited to this scope" className="hidden rounded-full border border-line bg-canvas px-1.5 py-0.5 text-xs text-muted md:inline">
              Scope: all regions · all brands
            </span>
            <span className="rounded-full bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn">Sample data</span>
            <Link href="/m/notifications" aria-label="Notifications, 3 unread" className="relative inline-flex min-h-touch min-w-touch items-center justify-center rounded-md hover:bg-sunken">
              <Bell aria-hidden size={18} />
              <span className="absolute right-1 top-1 rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-white">3</span>
            </Link>
          </div>
        </div>
        <main id="main" className="mx-auto w-full max-w-[90rem] flex-1 p-2 pb-8 lg:p-3 lg:pb-8">{children}</main>
        <nav aria-label="Quick" className="sticky bottom-0 grid grid-cols-4 border-t border-line bg-surface lg:hidden">
          {[["Home", "/"], ["Approvals", "/approvals"], ["Branches", "/branches"], ["Plan", "/billing"]].map(([l, h]) => (
            <Link key={h} href={h!} className="flex min-h-touch items-center justify-center text-xs font-medium hover:bg-sunken">{l}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
