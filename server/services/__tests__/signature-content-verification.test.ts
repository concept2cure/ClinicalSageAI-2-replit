/**
 * `verifySignatureIntegrity` — the live signature-verification path must be
 * able to see a content change.
 *
 * WHAT WAS WRONG. This function recomputed a hash over documentId, versionId,
 * signerId, signerEmail, signatureType, signatureMeaning and signedAt — every
 * one of them an identifier, none of them a byte of the signed document. So it
 * answered `valid: true` for a record that had been completely rewritten since
 * it was signed, which is the single question a signature exists to answer. It
 * was also the ONLY signature verification reachable in production: the
 * canonical validator that does re-derive the content digest
 * (`part11ComplianceService.validateElectronicSignature`, since removed) had no caller outside
 * a contract test.
 *
 * WHAT IS LOCKED HERE. The §11.70 binding is now re-derived through the SAME
 * shared evaluator the canonical validator uses, and:
 *
 *   • a changed document reports valid:false — the case that previously passed;
 *   • an unchanged document reports valid:true AND attestsToContent:true;
 *   • a signature written with no bound digest reports attestsToContent:false
 *     rather than a bare valid:true — it is not tampered, it simply never
 *     recorded what it was approving, and a reader must be able to tell those
 *     apart;
 *   • `valid` and `bindingVerified` stay separate claims.
 *
 * The first case is the regression test: against the old implementation it
 * fails, because nothing it hashed could move when content changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectResult = vi.fn();
const computeVersionBindingDigest = vi.fn();

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => selectResult() }),
      }),
    }),
  },
}));

vi.mock('../part11ComplianceService', () => ({
  default: { computeVersionBindingDigest: (...a: unknown[]) => computeVersionBindingDigest(...a) },
}));

import { verifySignatureIntegrity } from '../auth-security-service';
import { manifestSignatureHash } from '../part11/signature-persistence';

const SIGNED_AT = new Date('2026-08-14T10:00:00.000Z');
const BOUND_DIGEST = 'c'.repeat(64);

/** Build a row the way the WRITER builds one: the manifest is the attributed
 *  record, and signature_hash is the writer's own hash of it.
 *
 *  This fixture used to hash an identifier payload {documentId, versionId,
 *  signerId, ...} that no writer produces, so the suite proved the verifier
 *  against a row shape that does not exist — while the verifier reported every
 *  REAL signature as COMPROMISED. It now uses the exported recipe, so a change
 *  to how the writer hashes breaks this test instead of silently breaking
 *  production. */
function signatureRow(over: Record<string, unknown> = {}) {
  const base = {
    id: 1,
    documentId: 10,
    versionId: 100,
    signerId: 42,
    signerEmail: 'reviewer@example.com',
    signerName: 'Test Reviewer',
    signatureType: 'approval',
    signatureMeaning: 'Approved',
    signedAt: SIGNED_AT,
    isValid: true,
    boundPayloadDigest: BOUND_DIGEST,
    signatureManifest: {
      kind: 'governed-sign',
      meaning: 'Approved',
      signerId: 42,
      signerEmail: 'reviewer@example.com',
      signedAt: SIGNED_AT.toISOString(),
      boundPayloadDigest: BOUND_DIGEST,
    },
    ...over,
  };
  /* An explicit signatureHash in `over` wins — that is how the tampered-row
     case is built. Recomputing unconditionally here would silently discard the
     override and make that test assert nothing. */
  return {
    ...base,
    signatureHash:
      typeof over.signatureHash === 'string'
        ? over.signatureHash
        : manifestSignatureHash(base.signatureManifest),
  };
}

beforeEach(() => {
  selectResult.mockReset();
  computeVersionBindingDigest.mockReset();
});

describe('verifySignatureIntegrity — §11.70 content binding', () => {
  it('REGRESSION: a document rewritten since signing is not valid', async () => {
    selectResult.mockResolvedValueOnce([signatureRow()]);
    // The signed version's content now digests to something else.
    computeVersionBindingDigest.mockResolvedValueOnce('d'.repeat(64));

    const res = await verifySignatureIntegrity(1);

    // The old implementation returned true here: nothing it hashed could move.
    expect(res.valid).toBe(false);
    expect(res.bindingVerified).toBe(false);
    expect(res.details.contentBinding).toBe('BROKEN');
    expect(res.details.contentBindingReason).toMatch(/changed since signing/i);
  });

  it('an unchanged document verifies, and says the content was checked', async () => {
    selectResult.mockResolvedValueOnce([signatureRow()]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    const res = await verifySignatureIntegrity(1);

    expect(res.valid).toBe(true);
    expect(res.bindingVerified).toBe(true);
    expect(res.attestsToContent).toBe(true);
    expect(res.details.contentBinding).toBe('VERIFIED');
  });

  it('a signature with no bound digest says it attests to nothing', async () => {
    // This is what POST /api/auth/enterprise/electronic-signature writes today.
    selectResult.mockResolvedValueOnce([signatureRow({ boundPayloadDigest: '' })]);

    const res = await verifySignatureIntegrity(1);

    // Not tampered — it never recorded what it was approving. The distinction
    // is the whole point: a bare valid:true here is the misleading answer.
    expect(res.attestsToContent).toBe(false);
    expect(res.bindingVerified).toBe(false);
    expect(res.details.contentBinding).toBe('NOT_RECORDED');
    expect(computeVersionBindingDigest).not.toHaveBeenCalled();
  });

  it('reports unverifiable when the signed version content is gone', async () => {
    selectResult.mockResolvedValueOnce([signatureRow()]);
    computeVersionBindingDigest.mockResolvedValueOnce(null);

    const res = await verifySignatureIntegrity(1);

    expect(res.valid).toBe(false);
    expect(res.details.contentBinding).toBe('BROKEN');
    expect(res.details.contentBindingReason).toMatch(/no longer available/i);
  });

  it('still fails a row whose identifier hash was altered', async () => {
    selectResult.mockResolvedValueOnce([signatureRow({ signatureHash: 'f'.repeat(64) })]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    const res = await verifySignatureIntegrity(1);

    expect(res.valid).toBe(false);
    expect(res.details.hashIntegrity).toBe('COMPROMISED');
  });

  it('a revoked signature is not valid even with intact content', async () => {
    selectResult.mockResolvedValueOnce([signatureRow({ isValid: false })]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    const res = await verifySignatureIntegrity(1);

    expect(res.valid).toBe(false);
  });

  it('reports not found rather than guessing', async () => {
    selectResult.mockResolvedValueOnce([]);
    const res = await verifySignatureIntegrity(999);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});
