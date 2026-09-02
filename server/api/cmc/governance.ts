/**
 * The governed-action primitives the CMC route modules share.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * `resolveActorUserId` was written out four times across server/api/cmc — once
 * per route module that needed to name the signer of a Part 11 action — and the
 * e-signature body schema was about to become a fifth copy for the register
 * qualification endpoints. Attribution and the shape of a signature are exactly
 * the things that must not drift between two surfaces of the same product: a
 * copy that resolves the actor differently records a different person against
 * the same act.
 *
 * One implementation each, here; the route modules import them.
 */
import type express from 'express';
import { z } from 'zod';

/**
 * The meaning a signer selects, recorded as part of the signed record rather
 * than as a comment on it. An enum because the signature form offers exactly
 * these four and the stored value is evidence.
 */
export const SIGNATURE_MEANINGS = ['approval', 'review', 'responsibility', 'authorship'] as const;

/**
 * The body every governed CMC signature takes: why, what the signature means,
 * and the re-authentication that proves who signed.
 *
 * `meaning` is defaulted rather than required so a caller that omits it still
 * records a meaning; `reauth` is optional here because the verification (and
 * its refusal) is the re-auth service's decision, not this schema's.
 */
export const governedSignatureSchema = z.object({
  reason: z.string().min(8, 'A reason of at least 8 characters is required.'),
  meaning: z.enum(SIGNATURE_MEANINGS).optional().default('approval'),
  reauth: z
    .object({
      password: z.string().optional(),
      totp: z.string().optional(),
    })
    .optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * The authenticated user id, or 0 when there is none.
 *
 * Zero is not a user: every caller treats it as "no actor" and refuses the
 * governed action rather than recording an unattributed signature.
 */
export function resolveActorUserId(req: express.Request): number {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? 0;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
