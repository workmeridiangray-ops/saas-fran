import { Pool, type PoolClient, type QueryResultRow } from "pg";

const g = globalThis as unknown as { __pool?: Pool };
export const pool: Pool = (g.__pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));

export interface Db {
  q<T extends QueryResultRow = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Rows as arrays, in column order. Use when column names can collide (exports). */
  qa(sql: string, params?: unknown[]): Promise<unknown[][]>;
}
const wrap = (c: PoolClient): Db => ({
  async q(sql, params) { return (await c.query(sql, params as unknown[])).rows as never; },
  async one(sql, params) { return ((await c.query(sql, params as unknown[])).rows[0] ?? null) as never; },
  async qa(sql, params) { return (await c.query({ text: sql, values: params as unknown[], rowMode: "array" })).rows; },
});

/**
 * Run as a signed-in user: the transaction switches to the `authenticated` role and sets the user id,
 * so Postgres row-level security and the integrity triggers apply to every statement.
 */
export async function asUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const out = await fn(wrap(c));
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally { c.release(); }
}

/** Privileged connection for identity, platform staff and scheduled jobs. Never reachable from user input paths directly. */
export async function asService<T>(fn: (db: Db) => Promise<T>, actor?: string): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (actor) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [actor]);
    const out = await fn(wrap(c));
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally { c.release(); }
}

/** Turn a database error into a message a person can act on. */
export function friendly(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint?: string; hint?: string };
  if (err.code === "42501" || /row-level security/.test(err.message ?? "")) return "You don't have permission to do that here.";
  if (err.code === "23505") return "That already exists.";
  if (err.code === "23503") return "That refers to something that doesn't exist, or belongs to another company.";
  if (err.code === "23514") return "One of the values isn't allowed. Check the fields and try again.";
  if (err.code === "P0001" || err.code === "22023") return (err.message ?? "That isn't allowed.").replace(/^ERROR:\s*/, "");
  if (err.code === "23P01") return "That overlaps an existing entry.";
  console.error("[db]", e);
  return "Something went wrong and nothing was saved. Try again; if it keeps happening, contact support.";
}
export const isPlanLimit = (e: unknown) => (e as { hint?: string }).hint === "plan_limit";
