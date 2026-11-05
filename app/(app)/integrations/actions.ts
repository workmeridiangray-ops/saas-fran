"use server";
import { randomBytes } from "node:crypto";
import { asUser } from "@/lib/db";
import { friendly } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { EVENTS, SCOPES } from "@/lib/integrations/events";
import { assertPublicHost, newApiKey } from "@/lib/integrations/security";

export type Once = { error?: string; secret?: string; label?: string };

export async function createKey(_p: Once, f: FormData): Promise<Once> {
  const ctx = await requireCtx();
  try {
    const name = str(f, "name"); if (name.length < 2) return { error: "Give the key a name so you can recognise it later." };
    const scopes = SCOPES.map(([s]) => s).filter((s) => f.get(s) === "on"); if (scopes.length === 0) return { error: "Choose what the key may read." };
    const k = newApiKey();
    await asUser(ctx.user.id, (db) => db.q("insert into api_keys(company_id, name, prefix, key_hash, scopes, created_by) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, name, k.prefix, k.hash, scopes, ctx.user.id]));
    return { secret: k.raw, label: "API key" };
  } catch (e) { return { error: friendly(e) }; }
}
export async function createHook(_p: Once, f: FormData): Promise<Once> {
  const ctx = await requireCtx();
  try {
    const url = str(f, "url"); const events = EVENTS.map((e) => e.id).filter((e) => f.get(e) === "on"); if (events.length === 0) return { error: "Choose at least one event to send." };
    try { await assertPublicHost(url); } catch (e) { return { error: (e as Error).message }; }
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    await asUser(ctx.user.id, (db) => db.q("insert into webhook_endpoints(company_id, url, secret, events, created_by) values ($1,$2,$3,$4,$5)", [ctx.companyId, url, secret, events, ctx.user.id]));
    return { secret, label: "signing secret" };
  } catch (e) { return { error: friendly(e) }; }
}
export async function revokeKey(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/integrations", "/integrations", "Key revoked. It stops working immediately.", async () => { await asUser(ctx.user.id, (db) => db.q("update api_keys set revoked_at = now() where id = $1 and revoked_at is null", [id])); });
}
export async function setHookActive(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const on = str(f, "on") === "1";
  return run("/integrations", "/integrations", on ? "Webhook switched on." : "Webhook switched off.", async () => { await asUser(ctx.user.id, (db) => db.q("update webhook_endpoints set active = $2, consecutive_dead = 0, disabled_reason = null where id = $1", [id, on])); });
}
export async function sendTest(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/integrations", "/integrations", "Test event queued. It is sent within a minute; check the delivery log.", async () => {
    await asUser(ctx.user.id, (db) => db.q("select public.send_test_event($1)", [id]));
  });
}
export async function retryDelivery(f: FormData) {
  const ctx = await requireCtx(); const id = Number(str(f, "id"));
  return run("/integrations", "/integrations", "Queued to send again.", async () => {
    const n = await asUser(ctx.user.id, (db) => db.q("update webhook_deliveries set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null where id = $1 and status in ('failed','dead') returning id", [id]));
    if (!n.length) fail("Only a failed delivery can be retried.");
  });
}
