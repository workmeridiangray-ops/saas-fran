import { asService } from "@/lib/db";
import { MAX_ATTEMPTS, assertPublicHost, nextDelay, signPayload } from "./security";

interface Due { id: string; endpoint_id: string; event: string; payload: unknown; attempts: number; url: string; secret: string }

/** Send every delivery that is due. Safe to run concurrently (rows are locked) and repeatedly. */
export async function deliverDue(limit = 25): Promise<{ sent: number; failed: number; dead: number }> {
  const out = { sent: 0, failed: 0, dead: 0 };
  const due = await asService((db) => db.q<Due>(
    `update webhook_deliveries d set next_attempt_at = now() + interval '2 minutes'      -- claim: another worker won't pick these up meanwhile
       from webhook_endpoints e
      where d.id in (select id from webhook_deliveries where status in ('pending','failed') and next_attempt_at <= now() order by id limit $1 for update skip locked)
        and e.id = d.endpoint_id and e.active
      returning d.id, d.endpoint_id, d.event, d.payload, d.attempts, e.url, e.secret`, [limit]));
  for (const d of due) {
    const body = JSON.stringify(d.payload); const t = Math.floor(Date.now() / 1000);
    let status: number | null = null, error: string | null = null;
    try {
      await assertPublicHost(d.url);        // checked at send time too: DNS can change after the endpoint was saved
      const res = await fetch(d.url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json", "User-Agent": "NetworkManager-Webhooks/1", "X-NM-Event": d.event, "X-NM-Delivery": String(d.id), "X-NM-Signature": signPayload(d.secret, body, t) }, body });
      status = res.status; if (res.status < 200 || res.status >= 300) error = `The receiver answered ${res.status}`;
    } catch (e) { error = (e as Error).message.slice(0, 300); }
    const attempts = d.attempts + 1;
    if (!error) {
      out.sent++; await asService(async (db) => { await db.q("update webhook_deliveries set status = 'sent', attempts = $2, last_status = $3, last_error = null, sent_at = now() where id = $1", [d.id, attempts, status]); await db.q("update webhook_endpoints set consecutive_dead = 0 where id = $1", [d.endpoint_id]); });
    } else if (attempts >= MAX_ATTEMPTS) {
      out.dead++; await asService(async (db) => {
        await db.q("update webhook_deliveries set status = 'dead', attempts = $2, last_status = $3, last_error = $4 where id = $1", [d.id, attempts, status, error]);
        // A receiver that keeps failing is switched off, with the reason recorded, so it isn't hammered forever.
        await db.q("update webhook_endpoints set consecutive_dead = consecutive_dead + 1, active = case when consecutive_dead + 1 >= 10 then false else active end, disabled_reason = case when consecutive_dead + 1 >= 10 then 'Switched off after 10 deliveries failed in a row' else disabled_reason end where id = $1", [d.endpoint_id]); });
    } else {
      out.failed++; await asService((db) => db.q("update webhook_deliveries set status = 'failed', attempts = $2, last_status = $3, last_error = $4, next_attempt_at = now() + make_interval(secs => $5) where id = $1", [d.id, attempts, status, error, nextDelay(attempts)]));
    }
  }
  return out;
}
