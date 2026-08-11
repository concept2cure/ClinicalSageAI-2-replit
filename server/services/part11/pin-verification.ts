/**
 * 21 CFR Part 11 PIN verification — the shared identity check behind
 * electronic-signature ceremonies.
 *
 * Extracted (verbatim policy: bcrypt hash, 3 attempts, 30-minute lockout,
 * same `user_pins` table) from server/routes/authoring.router.ts's private
 * `verifyUserPin`, so task sign-off and document sign-off verify a signer
 * against ONE credential store with ONE lockout policy. The authoring router
 * still carries its local copy; consolidating it onto this module is a
 * mechanical follow-up (kept out of this change to avoid churning the
 * signature-sealing path it guards).
 *
 * The structured result lets a caller distinguish "wrong PIN" from "locked"
 * from "no PIN enrolled" — each needs different user guidance — without ever
 * leaking which of these occurred to an unauthenticated party (callers only
 * surface the message to the authenticated signer themselves).
 *
 * @module server/services/part11/pin-verification
 */
import bcrypt from 'bcryptjs';
import { pool } from '../../db.js';

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export type PinVerification =
  | { ok: true }
  | { ok: false; code: 'NO_PIN' | 'LOCKED' | 'INVALID' | 'UNAVAILABLE'; message: string };

/**
 * Verify a signer's PIN. Never throws; an infrastructure failure verifies
 * closed ('UNAVAILABLE'), not open.
 */
export async function verifySigningPin(
  email: string,
  pin: string,
  tenantId: number
): Promise<PinVerification> {
  try {
    const result = await pool.query(
      'SELECT pin_hash, failed_attempts, locked_until FROM user_pins WHERE email = $1 AND tenant_id = $2',
      [email, tenantId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return {
        ok: false,
        code: 'NO_PIN',
        message: 'No signing PIN is enrolled for your account. Set one from the authoring workspace.',
      };
    }

    const { pin_hash, failed_attempts, locked_until } = result.rows[0];

    if (locked_until && new Date(locked_until) > new Date()) {
      const remainingMin = Math.ceil((new Date(locked_until).getTime() - Date.now()) / 60000);
      return {
        ok: false,
        code: 'LOCKED',
        message: `Signing is locked after repeated failed attempts. Try again in ${remainingMin} minute${remainingMin === 1 ? '' : 's'}.`,
      };
    }

    const isValid = await bcrypt.compare(pin, pin_hash);

    if (isValid) {
      await pool.query(
        'UPDATE user_pins SET failed_attempts = 0, last_attempt = NOW(), locked_until = NULL WHERE email = $1 AND tenant_id = $2',
        [email, tenantId]
      );
      return { ok: true };
    }

    const newAttempts = (failed_attempts || 0) + 1;
    const lockUntil = newAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
    await pool.query(
      'UPDATE user_pins SET failed_attempts = $1, last_attempt = NOW(), locked_until = $2 WHERE email = $3 AND tenant_id = $4',
      [newAttempts, lockUntil, email, tenantId]
    );
    return {
      ok: false,
      code: 'INVALID',
      message:
        lockUntil != null
          ? 'Incorrect PIN. Signing is now locked for 30 minutes.'
          : `Incorrect PIN (attempt ${newAttempts} of ${MAX_ATTEMPTS}).`,
    };
  } catch (error) {
    console.error('[part11] PIN verification error:', error);
    return {
      ok: false,
      code: 'UNAVAILABLE',
      message: 'Signature verification is unavailable right now. The task was not completed.',
    };
  }
}

/** §11.50(a)(3) — the meanings a task sign-off may carry. */
export const TASK_SIGNATURE_MEANINGS = [
  'APPROVED',
  'REVIEWED',
  'RESPONSIBILITY',
  'AUTHORSHIP',
] as const;
export type TaskSignatureMeaning = (typeof TASK_SIGNATURE_MEANINGS)[number];
