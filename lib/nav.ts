import type { Resource } from "@/lib/rules/permissions";

export type Release = "R1" | "R2" | "extension";
export interface NavItem { label: string; href: string; resource: Resource; module?: string; built: boolean; release: Release; icon: string }
export interface NavGroup { label: string; items: NavItem[] }

/** Groups follow brief B3: Operations, Network, People, Purchasing, Finance, Reports, Settings. */
export const NAV: NavGroup[] = [
  { label: "Operations", items: [
    { label: "Command centre", href: "/", resource: "tasks", built: true, release: "R1", icon: "layout" },
    { label: "Approvals", href: "/approvals", resource: "approvals", built: true, release: "R1", icon: "check" },
    { label: "Tasks & checklists", href: "/m/tasks", resource: "tasks", module: "tasks", built: false, release: "R1", icon: "list" },
    { label: "Inspections", href: "/m/inspections", resource: "inspections", module: "inspections", built: false, release: "R1", icon: "clipboard" },
    { label: "Knowledge", href: "/m/knowledge", resource: "documents", module: "documents", built: false, release: "R1", icon: "book" },
    { label: "Tickets", href: "/m/tickets", resource: "tickets", module: "tickets", built: false, release: "R1", icon: "life" },
  ]},
  { label: "Network", items: [
    { label: "Branches", href: "/branches", resource: "branches", built: true, release: "R1", icon: "store" },
    { label: "Franchise pipeline", href: "/m/franchise", resource: "franchise", module: "franchise", built: false, release: "R2", icon: "handshake" },
    { label: "Assets", href: "/m/assets", resource: "assets", module: "assets", built: false, release: "R2", icon: "wrench" },
  ]},
  { label: "People", items: [
    { label: "People", href: "/m/people", resource: "people", module: "people", built: false, release: "R1", icon: "users" },
    { label: "Training", href: "/m/training", resource: "training", module: "training", built: false, release: "R1", icon: "cap" },
  ]},
  { label: "Purchasing", items: [
    { label: "Purchasing", href: "/m/purchasing", resource: "purchasing", module: "purchasing", built: false, release: "R1", icon: "cart" },
    { label: "Stock", href: "/m/inventory", resource: "inventory", module: "inventory", built: false, release: "R2", icon: "box" },
  ]},
  { label: "Finance", items: [
    { label: "Sales & royalties", href: "/m/royalties", resource: "royalties", module: "royalties", built: false, release: "R2", icon: "coins" },
  ]},
  { label: "Reports", items: [
    { label: "Reports", href: "/m/reports", resource: "reports", built: false, release: "R1", icon: "chart" },
  ]},
  { label: "Settings", items: [
    { label: "Plan & billing", href: "/billing", resource: "billing", built: true, release: "R1", icon: "card" },
    { label: "Configuration studio", href: "/m/studio", resource: "studio", module: "studio", built: false, release: "R2", icon: "sliders" },
    { label: "Integrations", href: "/m/integrations", resource: "integrations", module: "integrations", built: false, release: "extension", icon: "plug" },
  ]},
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
export const findBySlug = (slug: string) => ALL_ITEMS.find((i) => i.href === `/m/${slug}`);
