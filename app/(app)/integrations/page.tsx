import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createHook, createKey, retryDelivery, revokeKey, sendTest, setHookActive } from "./actions";
import { OnceForm } from "@/components/integrations/OnceForm";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { EVENTS, SCOPES } from "@/lib/integrations/events";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Integrations" };
const DTONE: Record<string, Tone> = { pending: "info", sent: "ok", failed: "warn", dead: "danger" };

export default async function Integrations({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "integrations", { module: "integrations", what: "integrations" }); if (denied) return denied;
  const { ok, err } = await searchParams; const edit = ctx.has("create", "integrations");
  const d = await asUser(ctx.user.id, async (db) => ({
    keys: await db.q<{ id: string; name: string; prefix: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string }>("select id, name, prefix, scopes, last_used_at, revoked_at, created_at from api_keys where company_id = $1 order by created_at desc", [ctx.companyId]),
    hooks: await db.q<{ id: string; url: string; events: string[]; active: boolean; consecutive_dead: number; disabled_reason: string | null }>("select id, url, events, active, consecutive_dead, disabled_reason from webhook_endpoints where company_id = $1 order by created_at desc", [ctx.companyId]),
    log: await db.q<{ id: string; event: string; status: string; attempts: number; last_status: number | null; last_error: string | null; created_at: string; url: string }>("select d.id, d.event, d.status, d.attempts, d.last_status, d.last_error, d.created_at, e.url from webhook_deliveries d join webhook_endpoints e on e.id = d.endpoint_id where d.company_id = $1 order by d.id desc limit 40", [ctx.companyId]),
  }));
  return (
    <>
      <PageHeader title="Integrations" description="Connect other systems: read your data with an API key, and get signed webhooks when things happen. Secrets are shown once." />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2">
          <Panel title="API keys">{d.keys.length === 0 ? <p className="text-sm text-muted">No keys yet.</p> : (
            <ul className="divide-y divide-line">{d.keys.map((k) => <li key={k.id} className="flex items-start justify-between gap-2 py-1.5 text-sm"><span><span className="font-medium">{k.name}</span> <code className="text-xs text-muted">{k.prefix}…</code><span className="block text-xs text-muted">{k.scopes.join(", ")} · {k.last_used_at ? `last used ${fmtDateTime(k.last_used_at, ctx.company.timezone)}` : "never used"}</span></span>
              {k.revoked_at ? <Status tone="neutral">Revoked</Status> : edit && <form action={revokeKey}><input type="hidden" name="id" value={k.id} /><SubmitButton variant="danger" pending="…">Revoke</SubmitButton></form>}</li>)}</ul>)}
            <p className="mt-2 text-xs text-muted">Use: <code>curl -H "Authorization: Bearer KEY" {"{your address}"}/api/v1/branches</code>. Also <code>tasks</code>, <code>tickets</code>, <code>requisitions</code>. Read-only, 120 requests a minute, paged with <code>?after=</code>.</p></Panel>
          {edit && <FormCard title="New API key"><OnceForm action={createKey} button="Create key"><Field label="Name" name="name" required placeholder="Reporting dashboard" />
            <fieldset><legend className="mb-0.5 text-sm font-medium">May read</legend><div className="grid gap-0.5 sm:grid-cols-2">{SCOPES.map(([s, l]) => <label key={s} className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name={s} />{l}</label>)}</div></fieldset></OnceForm></FormCard>}
        </div>
        <div className="space-y-2">
          <Panel title="Webhooks">{d.hooks.length === 0 ? <p className="text-sm text-muted">No webhooks yet.</p> : (
            <ul className="divide-y divide-line">{d.hooks.map((h) => <li key={h.id} className="py-1.5 text-sm"><div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{h.url}</span><span className="block text-xs text-muted">{h.events.join(", ")}</span>{h.disabled_reason && <span className="block text-xs text-danger">{h.disabled_reason}</span>}</span><Status tone={h.active ? "ok" : "neutral"}>{h.active ? "On" : "Off"}</Status></div>
              {edit && <div className="mt-1 flex gap-1"><form action={sendTest}><input type="hidden" name="id" value={h.id} /><SubmitButton variant="secondary" pending="…">Send test</SubmitButton></form><form action={setHookActive}><input type="hidden" name="id" value={h.id} /><input type="hidden" name="on" value={h.active ? "0" : "1"} /><SubmitButton variant="secondary" pending="…">{h.active ? "Switch off" : "Switch on"}</SubmitButton></form></div>}</li>)}</ul>)}
            <p className="mt-2 text-xs text-muted">Each request carries <code>X-NM-Signature: t=…,v1=…</code>, an HMAC-SHA256 of <code>timestamp.body</code> with your secret. Reject requests older than 5 minutes. Failed deliveries retry after 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours.</p></Panel>
          {edit && <FormCard title="New webhook"><OnceForm action={createHook} button="Add webhook"><Field label="Address (https)" name="url" type="url" required placeholder="https://example.com/hooks/network-manager" />
            <fieldset><legend className="mb-0.5 text-sm font-medium">Send me</legend><div className="grid gap-0.5">{EVENTS.map((e) => <label key={e.id} className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name={e.id} />{e.label}</label>)}</div></fieldset></OnceForm></FormCard>}
        </div>
      </div>
      <h2 className="mb-1 mt-4 text-sm font-semibold text-muted">Delivery log</h2>
      {d.log.length === 0 ? <StateMessage title="Nothing sent yet">Every attempt is recorded here, with the reply, so a failure is never silent.</StateMessage> : (
        <TableWrap label="Webhook deliveries"><thead><tr><Th>When</Th><Th>Event</Th><Th>To</Th><Th num>Attempts</Th><Th>Result</Th><Th><span className="sr-only">Retry</span></Th></tr></thead>
          <tbody>{d.log.map((x) => <tr key={x.id}><Td>{fmtDateTime(x.created_at, ctx.company.timezone)}</Td><Td>{x.event}</Td><Td className="max-w-[16rem] truncate">{x.url}</Td><Td num>{x.attempts}</Td><Td><Status tone={DTONE[x.status] ?? "neutral"}>{titleCase(x.status)}</Status>{x.last_error && <span className="block text-xs text-muted">{x.last_error}</span>}</Td>
            <Td>{edit && (x.status === "failed" || x.status === "dead") && <form action={retryDelivery}><input type="hidden" name="id" value={x.id} /><SubmitButton variant="secondary" pending="…">Retry</SubmitButton></form>}</Td></tr>)}</tbody></TableWrap>)}
    </>
  );
}
