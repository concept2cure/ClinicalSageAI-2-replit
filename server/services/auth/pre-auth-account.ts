/**
 * How a pre-auth request finds the one account it acts as (D3, 2026-10-04;
 * evidence docs/evidence/D3/2026-10-04-pre-auth-narrowing/).
 *
 * The pre-auth scope no longer reads public.users: the table's policy admits it
 * only to the account it has been bound to (server/db/tenantStore.ts,
 * bindPreAuthAccount). A sign-in, signup or password reset starts from what the
 * person typed — an email address, a reset token — so it asks a definer function
 * for the id that answers to it (the id only; no other column crosses), binds
 * the request to that id, and reads and writes that row from then on.
 *
 * A request that holds a server-signed artifact naming the account — an access
 * or refresh token, an MFA challenge, a verification token — binds that id
 * directly (bindPreAuthAccount; verifyLiveToken does it for live tokens).
 *
 * The one canonical path: a handler does not query users by email or by
 * reset token itself.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { bindPreAuthAccount } from '../../db/tenantStore';

async function idOf(statement: ReturnType<typeof sql>): Promise<number | null> {
  const result = (await db.execute(statement)) as unknown as { rows: Array<{ id: number | string | null }> };
  const raw = result.rows[0]?.id;
  const id = raw == null ? null : Number(raw);
  return id !== null && Number.isInteger(id) && id > 0 ? id : null;
}

/** Whether an account is registered to this exact address: its id, without binding (signup's check). */
export async function accountIdForEmail(email: string): Promise<number | null> {
  return idOf(sql`SELECT public.user_id_for_email(${email}) AS id`);
}

/**
 * A new account's id, taken from the sequence and bound to the request BEFORE
 * the row is written: RETURNING is held to the SELECT policy, which admits the
 * pre-auth scope only to its bound account. Bind before a transaction opens —
 * the pool applies the scope at BEGIN.
 */
export async function bindNewAccountId(): Promise<number> {
  const id = await idOf(sql`SELECT nextval(pg_get_serial_sequence('public.users', 'id'))::int AS id`);
  if (id === null) throw new Error('bindNewAccountId: the users sequence returned no id');
  bindPreAuthAccount(id);
  return id;
}

/** The account registered to this exact address, bound to the request; null when there is none. */
export async function bindAccountByEmail(email: string): Promise<number | null> {
  const id = await idOf(sql`SELECT public.user_id_for_email(${email}) AS id`);
  if (id !== null) bindPreAuthAccount(id);
  return id;
}

/** The account holding this hashed reset token, bound to the request; null when there is none. */
export async function bindAccountByResetToken(tokenHash: string): Promise<number | null> {
  const id = await idOf(sql`SELECT public.user_id_for_reset_token(${tokenHash}) AS id`);
  if (id !== null) bindPreAuthAccount(id);
  return id;
}

export { bindPreAuthAccount };
