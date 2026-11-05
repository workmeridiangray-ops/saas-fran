import type { Resource } from "@/lib/rules/permissions";

export interface NavItem { label: string; href: string; resource: Resource; module?: string; icon: string }
export interface NavGroup { label: string; items: NavItem[] }

/** Groups follow brief B3. An item shows only if the role can view it and the plan includes its module. */
export const NAV: NavGroup[] = [
  { label: "Operations", items: [
    { label: "Command centre", href: "/", resource: "tasks", icon: "layout" },
    { label: "Approvals", href: "/approvals", resource: "approvals", icon: "check" },
    { label: "Tasks", href: "/tasks", resource: "tasks", module: "tasks", icon: "list" },
    { label: "Checklists", href: "/checklists", resource: "tasks", module: "tasks", icon: "ticks" },
    { label: "Inspections", href: "/inspections", resource: "inspections", module: "inspections", icon: "clipboard" },
    { label: "Knowledge", href: "/knowledge", resource: "documents", module: "documents", icon: "book" },
    { label: "Tickets", href: "/tickets", resource: "tickets", module: "tickets", icon: "life" },
  ]},
  { label: "Network", items: [
    { label: "Branches", href: "/branches", resource: "branches", icon: "store" },
    { label: "Organisation", href: "/organisation", resource: "organisation", icon: "tree" },
    { label: "Franchise", href: "/franchise", resource: "franchise", module: "franchise", icon: "handshake" },
    { label: "Opening projects", href: "/projects", resource: "projects", module: "projects", icon: "rocket" },
    { label: "Assets & licences", href: "/assets", resource: "assets", module: "assets", icon: "wrench" },
  ]},
  { label: "People", items: [
    { label: "People & access", href: "/people", resource: "users", module: "people", icon: "users" },
    { label: "Training", href: "/training", resource: "training", module: "training", icon: "cap" },
  ]},
  { label: "Purchasing", items: [{ label: "Purchasing", href: "/purchasing", resource: "purchasing", module: "purchasing", icon: "cart" },
    { label: "Stock", href: "/stock", resource: "inventory", module: "stock", icon: "box" }]},
  { label: "Finance", items: [{ label: "Sales & royalties", href: "/royalties", resource: "royalties", module: "royalties", icon: "coins" }]},
  { label: "Reports", items: [{ label: "Reports & exports", href: "/reports", resource: "reports", icon: "chart" }]},
  { label: "Settings", items: [
    { label: "Plan & billing", href: "/billing", resource: "billing", icon: "card" },
    { label: "Audit log", href: "/audit", resource: "organisation", icon: "shield" },
  ]},
];
