/**
 * A refusal a Vault service returns instead of throwing, and the one way such
 * a service runs a transaction that may end in one.
 *
 * Vault writers report "not allowed" or "not found" as a value the route maps
 * to HTTP and AnA maps to its transcript; only an unexpected error escapes.
 * A refusal decided inside a transaction must roll it back. That is done by
 * the canonical transaction() (server/db/runtime.ts): a refusal is thrown as a
 * private signal so transaction() rolls back (and evicts a broken connection),
 * then caught here and returned. Not a second transaction implementation.
 */
import type { PoolClient } from 'pg';
import { transaction } from '../../db.js';

export type Refusal = { ok: false; status: number; code: string; message: string };

export const refuse = (status: number, code: string, message: string): Refusal => ({ ok: false, status, code, message });

export const isRefusal = (v: unknown): v is Refusal =>
  typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false && typeof (v as Refusal).code === 'string';

class RefusalSignal {
  constructor(readonly refusal: Refusal) {}
}

/** Run `work` in a transaction; a returned refusal rolls it back and is returned. */
export async function inRefusableTransaction<T>(work: (client: PoolClient) => Promise<T | Refusal>): Promise<T | Refusal> {
  try {
    return await transaction(async (client: PoolClient) => {
      const out = await work(client);
      if (isRefusal(out)) throw new RefusalSignal(out);
      return out;
    });
  } catch (err) {
    if (err instanceof RefusalSignal) return err.refusal;
    throw err;
  }
}
