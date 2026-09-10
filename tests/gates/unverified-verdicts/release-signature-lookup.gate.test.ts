/**
 * WO-16B finding 14 — a release-signature lookup that THREW was reported to the
 * operator as "the signature was superseded or rolled back", a §11.70 verdict
 * about a check that never ran.
 *
 * `findActiveReleaseSignature` caught every error, logged it as "non-fatal",
 * and returned null — the same value as a genuine miss — so
 * `resolveSignedPackageForExport` refused with `signature-revoked`.
 *
 * Failure is injected at the dependency: the shared pool rejects the query the
 * way a database missing the column did in the incident this function's own
 * comment records (42703). RED on the pre-fix head: resolves `null`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../setup';

const columnGone = Object.assign(new Error('column "bound_payload_digest" does not exist'), {
  code: '42703',
});

describe('findActiveReleaseSignature: a lookup that could not run is not a miss', () => {
  beforeEach(() => {
    // Reassigned, not re-implemented: the runtime wraps the stub's query in
    // place at import time (see decision-lineage.gate.test.ts).
    (mockPool as { query: unknown }).query = vi.fn(() => Promise.reject(columnGone));
  });

  it('throws VerificationUnavailableError instead of returning null', async () => {
    const { findActiveReleaseSignature } = await import(
      '../../../server/services/submission-package-orchestrator'
    );
    await expect(
      findActiveReleaseSignature({ organizationId: 7, boundPayloadDigest: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ name: 'VerificationUnavailableError' });
  });

  it('still answers null — a real miss — for caller garbage that cannot prove a signature', async () => {
    const { findActiveReleaseSignature } = await import(
      '../../../server/services/submission-package-orchestrator'
    );
    await expect(findActiveReleaseSignature({ organizationId: 0, boundPayloadDigest: 'x' })).resolves.toBeNull();
    await expect(findActiveReleaseSignature({ organizationId: 7, boundPayloadDigest: '' })).resolves.toBeNull();
  });
});
