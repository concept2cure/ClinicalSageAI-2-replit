/**
 * Production wiring for `reverifySigner`.
 *
 * Kept out of reverify-signer.ts so the §11.200 policy itself stays pure and
 * unit-testable with no database, matching the split this directory already
 * uses. Every signing surface builds its dependencies HERE rather than each
 * reaching for `pool` and `bcrypt` on its own — so "how is a password checked"
 * has one answer across the product, and changing it changes it everywhere.
 *
 * @compliance 21 CFR Part 11 §11.200(a)(1)
 */
import bcrypt from 'bcryptjs';
import { pool } from '../../db.js';
import { verifyToken as verifyMfaToken, isMfaEnabled } from '../mfaService.js';
import type { ReverifySignerDeps } from './reverify-signer.js';

/**
 * The signer's stored bcrypt hash, or null when there is none.
 *
 * Fails closed: a missing table or an unreadable row yields null, which
 * `reverifySigner` treats as a failed first factor rather than a skipped one.
 */
export async function loadPasswordHash(userId: number): Promise<string | null> {
  try {
    // tenant-isolation-safe: re-auth self-lookup — userId is the authenticated
    // user's own session id, never client-supplied; users is a global identity
    // table keyed by primary key.
    const result = await pool.query(`SELECT password_hash FROM users WHERE id = $1 LIMIT 1`, [
      userId,
    ]);
    return result.rows[0]?.password_hash || null;
  } catch (err: unknown) {
    // 42P01 (undefined_table) is schema drift, not an incident worth logging on
    // every attempt; anything else is worth a line. Either way: fail closed.
    if ((err as { code?: string })?.code !== '42P01') {
      console.warn(
        `[part11] password lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }
}

/** The real dependencies, wired once. */
export function signerReverificationDeps(): ReverifySignerDeps {
  return {
    loadPasswordHash,
    comparePassword: (plain, hash) => bcrypt.compare(plain, hash),
    isMfaEnabled,
    verifyMfaToken,
  };
}
