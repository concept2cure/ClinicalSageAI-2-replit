/**
 * The reason for change, validated by the SERVER.
 *
 * 21 CFR 11.10(e) asks that a change record carry the reason for the change.
 * Three authoring endpoints (section save, freeze, review verdict) required a
 * reason on the client only — any string, or none, reached the ledger — and
 * freeze substituted a canned sentence when none was given, which is the
 * "reason field the server ignores" anti-pattern: a placeholder in a hash-chained
 * ledger reads as a real reason and is worse than an empty one.
 *
 * Eight characters is the floor protocol-development (`protocol-development.ts`),
 * review (`Review.tsx`) and the QMS approval flow already apply; this file makes
 * it one rule. A missing or short reason is refused with the sentence the user
 * should read. It is never replaced.
 */
import { z } from 'zod';
import { GOVERNED_REASON_MIN, GOVERNED_REASON_MAX } from '../../shared/constants/governed-reason';

export { GOVERNED_REASON_MIN, GOVERNED_REASON_MAX };

export const governedReason = z
  .string()
  .trim()
  .min(GOVERNED_REASON_MIN, `A reason for change of at least ${GOVERNED_REASON_MIN} characters is required.`)
  .max(GOVERNED_REASON_MAX, `A reason for change is at most ${GOVERNED_REASON_MAX} characters.`);

export type ReasonVerdict = { ok: true; reason: string } | { ok: false; error: string };

/** Validate a client-supplied reason. `undefined`/`null`/non-string count as missing. */
export function requireGovernedReason(value: unknown): ReasonVerdict {
  const parsed = governedReason.safeParse(typeof value === 'string' ? value : '');
  if (parsed.success) return { ok: true, reason: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'A reason for change is required.' };
}

export type OptionalReasonVerdict = { ok: true; reason: string | null } | { ok: false; error: string };

/** An optional reason: absent is fine; present, it must meet the same floor. */
export function optionalGovernedReason(value: unknown): OptionalReasonVerdict {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, reason: null };
  }
  return requireGovernedReason(value);
}
