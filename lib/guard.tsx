import type { Ctx } from "@/lib/ctx";
import type { Action, Resource } from "@/lib/rules/permissions";
import { NoAccess, PlanGate, ReadOnly } from "@/components/ui/flash";

/** Returns the "no access" or "not on your plan" screen, or null when the page may render. */
export function guard(ctx: Ctx, resource: Resource, opts: { action?: Action; module?: string; what?: string } = {}) {
  if (ctx.company.status === "suspended" && opts.action && opts.action !== "view" && resource !== "billing") return <ReadOnly />;
  if (opts.module && !ctx.modules.includes(opts.module)) return <PlanGate module={opts.what ?? opts.module} />;
  if (!ctx.has(opts.action ?? "view", resource)) return <NoAccess what={opts.what ?? resource} />;
  return null;
}
