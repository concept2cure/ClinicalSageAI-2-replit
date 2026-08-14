/**
 * The AI-action idempotency cache must not serve one organization's response
 * into another.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * The key was hashed over (actionType, targetType, targetId, projectId, userId).
 * `userId` does not stand in for the organization: a user can belong to several
 * organizations and switch between them
 * (`POST /api/auth/enterprise/select-organization`), which is exactly how a CRO
 * consultant serving several sponsors works. Same person, same action, colliding
 * targetId across two tenancies → one shared cache entry for the 5-minute TTL.
 *
 * The confidentiality impact is bounded, since both organizations are ones the
 * user may already access. The RECORD INTEGRITY impact is not: a cached response
 * is returned carrying its original `provenance.organizationId`, so an action
 * executed in sponsor B's context can come back attributed to sponsor A. Under
 * 21 CFR Part 11 that is a record with the wrong attribution. The same window
 * also outlives a membership revocation by up to the TTL.
 *
 * Both neighbouring idempotency caches (routes/ana-ri/chat.ts and
 * routes/csr-intelligence-routes.ts) already key on tenant + user. This was the
 * one that did not, and it was found by enumerating all 23 module-level caches
 * rather than by reading this file.
 *
 * @compliance 21 CFR Part 11 §11.10(b) — records must be accurately attributed.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

/**
 * The key function is module-private, so its exact composition is reproduced
 * here. That is a real duplication risk, so the test asserts the PROPERTY (the
 * org changes the key; nothing else about the request does) rather than a
 * hardcoded digest — a re-ordering of the payload fields keeps this green,
 * while dropping the org from it does not.
 */
function keyOf(args: {
  actionType: string;
  targetType?: string;
  targetId?: string;
  projectId?: string;
  organizationId: number;
  userId: number;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        actionType: args.actionType,
        targetType: args.targetType,
        targetId: args.targetId,
        projectId: args.projectId,
        organizationId: args.organizationId,
        userId: args.userId,
      })
    )
    .digest('hex')
    .slice(0, 16);
}

const base = {
  actionType: 'export_document',
  targetType: 'document',
  targetId: '42',
  projectId: undefined,
  userId: 7,
};

describe('the idempotency key separates organizations', () => {
  it('gives the SAME user a different key in a different organization', () => {
    // The defect in one assertion. One consultant, two sponsors, the same
    // document id — which collide because ids are per-table serials.
    const inSponsorA = keyOf({ ...base, organizationId: 101 });
    const inSponsorB = keyOf({ ...base, organizationId: 202 });
    expect(inSponsorA).not.toBe(inSponsorB);
  });

  it('still replays for the same user in the same organization', () => {
    // The negative control. A key that included a timestamp or a random value
    // would satisfy the assertion above and silently disable idempotency, which
    // is the failure this whole cache exists to prevent.
    expect(keyOf({ ...base, organizationId: 101 })).toBe(keyOf({ ...base, organizationId: 101 }));
  });

  it('still separates two users inside one organization', () => {
    // Adding the org must not have replaced the user scoping.
    const alice = keyOf({ ...base, organizationId: 101, userId: 7 });
    const bob = keyOf({ ...base, organizationId: 101, userId: 8 });
    expect(alice).not.toBe(bob);
  });

  it('separates a project-scoped action from an unscoped one', () => {
    const scoped = keyOf({ ...base, organizationId: 101, projectId: 'p-1' });
    const unscoped = keyOf({ ...base, organizationId: 101 });
    expect(scoped).not.toBe(unscoped);
  });
});

describe('the live key function agrees with the property above', () => {
  it('is composed over the organization', async () => {
    // Guards against this file drifting from the implementation: the source is
    // read and asserted to include organizationId in the hashed payload. Crude,
    // but it fails loudly if someone removes the field, which a reproduced
    // helper alone cannot detect.
    const fs = await import('node:fs');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '..', 'action-registry.ts'), 'utf8');
    const fn = src.slice(
      src.indexOf('function computeIdempotencyKey'),
      src.indexOf('function getCachedResponse')
    );
    expect(fn, 'computeIdempotencyKey no longer hashes the organization').toContain(
      'organizationId,'
    );
    expect(fn).toContain('userId,');
  });
});
