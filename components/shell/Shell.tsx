import Link from "next/link";
import {
  Bell, BookOpen, Box, CheckSquare, ChartColumn, ClipboardCheck, Coins, CreditCard, GraduationCap, ListChecks, ListTodo, LayoutDashboard,
  LifeBuoy, Menu, Network, Search, ShieldCheck, ShoppingCart, Store, Users, Wrench, ChevronsUpDown, LogOut, UserCog, type LucideIcon,
} from "lucide-react";
import { NAV } from "@/lib/nav";
import type { Ctx } from "@/lib/ctx";
import { signOut } from "@/app/(auth)/actions";

const ICONS: Record<string, LucideIcon> = {
  layout: LayoutDashboard, check: CheckSquare, list: ListTodo, ticks: ListChecks, clipboard: ClipboardCheck, book: BookOpen, life: LifeBuoy,
  store: Store, tree: Network, wrench: Wrench, users: Users, cap: GraduationCap, cart: ShoppingCart, coins: Coins, chart: ChartColumn, card: CreditCard, shield: ShieldCheck, box: Box,
};

function NavList({ ctx }: { ctx: Ctx }) {
  const groups = NAV.map((g) => ({
    ...g, items: g.items.filter((i) => ctx.has("view", i.resource) && (!i.module || ctx.modules.includes(i.module))),
  })).filter((g) => g.items.length > 0);
  return (
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
                    <Icon aria-hidden size={16} className="text-muted" />{i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const STATUS_BANNER: Record<string, { tone: string; text: string }> = {
  trial: { tone: "bg-info-bg text-info", text: "You're on a free trial." },
  past_due: { tone: "bg-warn-bg text-warn", text: "A payment is overdue. Pay the open invoice to avoid your workspace becoming read-only." },
  suspended: { tone: "bg-danger-bg text-danger", text: "This workspace is read-only until the open invoice is paid. Your data is safe and can be exported." },
  closing: { tone: "bg-warn-bg text-warn", text: "This company is being closed. Export what you need." },
};

export function Shell({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  const banner = STATUS_BANNER[ctx.company.status];
  const scope = ctx.membership.scope;
  const scoped = [scope.branchIds, scope.regionIds, scope.brandIds].some((a) => a && a.length > 0);
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-2">Skip to content</a>
      <aside aria-label="Primary" className="hidden w-[15rem] shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-2">
          <Link href="/workspaces" className="mb-3 flex min-h-touch items-center justify-between gap-1 rounded-md border border-line bg-canvas px-2 hover:bg-sunken" title="Switch workspace">
            <span className="min-w-0"><span className="block text-xs text-muted">Workspace</span><span className="block truncate text-sm font-semibold">{ctx.company.name}</span></span>
            <span className="sr-only">, switch workspace</span><ChevronsUpDown aria-hidden size={16} className="shrink-0 text-muted" />
          </Link>
          <NavList ctx={ctx} />
          <div className="mt-auto space-y-0.5 border-t border-line pt-2">
            {ctx.isPlatformStaff && <Link href="/platform" className="flex min-h-touch items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-brand hover:bg-sunken"><UserCog aria-hidden size={16} />Platform admin</Link>}
            <Link href="/account" className="block truncate px-1.5 py-0.5 text-xs text-muted hover:underline">{ctx.user.displayName || ctx.user.email}</Link>
            <form action={signOut}><button className="flex min-h-touch w-full items-center gap-1.5 rounded-md px-1.5 text-sm hover:bg-sunken"><LogOut aria-hidden size={16} className="text-muted" />Sign out</button></form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 flex min-h-[3.5rem] items-center gap-2 border-b border-line bg-surface px-2 lg:px-3">
          <details className="relative lg:hidden">
            <summary aria-label="Open menu" className="flex min-h-touch min-w-touch cursor-pointer list-none items-center justify-center rounded-md hover:bg-sunken"><Menu aria-hidden size={20} /></summary>
            <div className="absolute left-0 top-full z-20 max-h-[80vh] w-[16rem] overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-overlay">
              <p className="mb-1 truncate px-1 text-sm font-semibold">{ctx.company.name}</p>
              <NavList ctx={ctx} />
              <div className="mt-2 border-t border-line pt-1">
                <Link href="/workspaces" className="flex min-h-touch items-center rounded-md px-1.5 text-sm hover:bg-sunken">Switch workspace</Link>
                <Link href="/account" className="flex min-h-touch items-center rounded-md px-1.5 text-sm hover:bg-sunken">Your account</Link>
                <form action={signOut}><button className="flex min-h-touch w-full items-center rounded-md px-1.5 text-sm hover:bg-sunken">Sign out</button></form>
              </div>
            </div>
          </details>
          <p className="min-w-0 truncate text-sm font-semibold lg:hidden">{ctx.company.name}</p>
          <form role="search" action="/search" className="relative hidden max-w-form flex-1 sm:block">
            <label htmlFor="global-search" className="sr-only">Search branches, tasks, tickets and documents</label>
            <Search aria-hidden size={16} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-muted" />
            <input id="global-search" name="q" placeholder="Search branches, tasks, tickets, documents" className="min-h-touch w-full rounded-md border border-line bg-canvas pl-4 pr-1.5 text-sm placeholder:text-muted" />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <span title="What you can see is limited to this scope" className="hidden rounded-full border border-line bg-canvas px-1.5 py-0.5 text-xs text-muted md:inline">
              Scope: {scoped ? "assigned branches only" : "whole company"}
            </span>
            <Link href="/notifications" aria-label={`Notifications, ${ctx.unread} unread`} className="relative inline-flex min-h-touch min-w-touch items-center justify-center rounded-md hover:bg-sunken">
              <Bell aria-hidden size={18} />
              {ctx.unread > 0 && <span className="absolute right-1 top-1 rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-white">{ctx.unread > 9 ? "9+" : ctx.unread}</span>}
            </Link>
          </div>
        </div>
        {banner && <div role="status" className={`px-3 py-1 text-sm ${banner.tone}`}>{banner.text} <Link href="/billing" className="font-semibold underline">Plan & billing</Link></div>}
        <main id="main" className="mx-auto w-full max-w-[90rem] flex-1 p-2 pb-8 lg:p-3 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}
