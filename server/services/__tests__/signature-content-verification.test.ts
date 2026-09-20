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

const whereClauses: unknown[] = [];
vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          whereClauses.push(clause);
          return { limit: () => selectResult() };
        },
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
  whereClauses.length = 0;
});

const ORG = 7;

/**
 * The columns a captured Drizzle condition actually REFERENCES.
 *
 * Walks `queryChunks` only — never arbitrary object properties. The first
 * version of this helper walked the whole object graph, reached the pgTable
 * through `column.table`, and so found every sibling column including
 * organization_id: it passed against the unscoped `eq(id, …)` it was written to
 * catch. A test that cannot fail is worse than no test, so this traverses the
 * clause structure and picks out only chunks that are columns (a `name` plus a
 * `table` back-reference). Verified to discriminate: eq(id,1) -> ["id"];
 * and(eq(id,1), eq(organizationId,7)) -> ["id","organization_id"].
 */
function columnsOf(clause: unknown): string[] {
  const names: string[] = [];
  const walk = (node: unknown) => {
    const chunks = (node as { queryChunks?: unknown[] } | null)?.queryChunks;
    if (!Array.isArray(chunks)) return;
    for (const c of chunks) {
      if (!c || typeof c !== 'object') continue;
      const cc = c as { name?: unknown; table?: unknown; queryChunks?: unknown[] };
      if (typeof cc.name === 'string' && cc.table) names.push(cc.name);
      else if (Array.isArray(cc.queryChunks)) walk(c);
    }
  };
  walk(clause);
  return names;
}

describe('verifySignatureIntegrity — §11.70 content binding', () => {
  it('REGRESSION: a document rewritten since signing is not valid', async () => {
    selectResult.mockResolvedValueOnce([signatureRow()]);
    // The signed version's content now digests to something else.
    computeVersionBindingDigest.mockResolvedValueOnce('d'.repeat(64));

    const res = await verifySignatureIntegrity(1, ORG);

    // The old implementation returned true here: nothing it hashed could move.
    expect(res.valid).toBe(false);
    expect(res.bindingVerified).toBe(false);
    expect(res.details.contentBinding).toBe('BROKEN');
    expect(res.details.contentBindingReason).toMatch(/changed since signing/i);
  });

  it('an unchanged document verifies, and says the content was checked', async () => {
    selectResult.mockResolvedValueOnce([signatureRow()]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    const res = await verifySignatureIntegrity(1, ORG);

    expect(res.valid).toBe(true);
    expect(res.bindingVerified).toBe(true);
    expect(res.attestsToContent).toBe(true);
    expect(res.details.contentBinding).toBe('VERIFIED');
  });

  it('a signature with no bound digest says it attests to nothing', async () => {
    // This is what POST /api/auth/enterprise/electronic-signature writes today.
    selectResult.mockResolvedValueOnce([signatureRow({ boundPayloadDigest: '' })]);

    const res = await verifySignatureIntegrity(1, ORG);

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

    const res = await verifySignatureIntegrity(1, ORG);

    expect(res.valid).toBe(false);
    expect(res.details.contentBinding).toBe('BROKEN');
    expect(res.details.contentBindingReason).toMatch(/no longer available/i);
  });

  it('still fails a row whose identifier hash was altered', async () => {
    selectResult.mockResolvedValueOnce([signatureRow({ signatureHash: 'f'.repeat(64) })]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    const res = await verifySignatureIntegrity(1, ORG);

    expect(res.valid).toBe(false);
    expect(res.details.hashIntegrity).toBe('COMPROMISED');
  });

  it('a revoked signature is not valid even with intact content', async () => {
    selectResult.mockResolvedValueOnce([signatureRow({ isValid: false })]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    const res = await verifySignatureIntegrity(1, ORG);

    expect(res.valid).toBe(false);
  });

  it('reports not found rather than guessing', async () => {
    selectResult.mockResolvedValueOnce([]);
    const res = await verifySignatureIntegrity(999, ORG);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});


describe('verifySignatureIntegrity — binding basis decides what can be re-derived', () => {
  /*
   * There are eleven binding bases (BINDING_BASIS in part11/signature-persistence)
   * and `computeVersionBindingDigest` can re-derive exactly ONE of them:
   * DOCUMENT_VERSION_CONTENT, the sha256 of a document version's content. The
   * verifier used to re-derive whenever `versionId` was set and pass `null`
   * otherwise, which made it answer about a digest of something else entirely:
   *
   *   • a governed-action row carries the audit sha256 CHAIN HASH (the basis says
   *     so, and says it "is NOT a content hash and must never be presented as
   *     one") with versionId NULL -> current=null -> "content is no longer
   *     available", reported as contentBinding BROKEN;
   *   • a submission-release row carries the RELEASE PACKAGE digest with
   *     versionId SET -> compared against a re-derived document-version digest it
   *     can never equal -> "changed since signing (tamper detected)".
   *
   * Both are untampered signatures reported as broken, on the one endpoint that
   * answers an inspector's central question. These tests fail against that
   * implementation.
   */
  it('does not report a governed-action signature as tampered', async () => {
    selectResult.mockResolvedValueOnce([
      signatureRow({
        versionId: null,
        documentId: null,
        signedTarget: 'submission:42',
        bindingBasis: 'governed-action-sha256-chain',
      }),
    ]);

    const res = await verifySignatureIntegrity(1, ORG);

    // Nothing is wrong with this signature.
    expect(res.valid).toBe(true);
    expect(res.details.contentBinding).not.toBe('BROKEN');
    // But it must not claim the content was checked, and the basis is explicitly
    // not a content hash — so it attests to no content at all.
    expect(res.bindingVerified).toBe(false);
    expect(res.attestsToContent).toBe(false);
    // And it must not have tried to re-derive a document version it has none of.
    expect(computeVersionBindingDigest).not.toHaveBeenCalled();
  });

  it('does not compare a release-package digest against document-version content', async () => {
    selectResult.mockResolvedValueOnce([
      signatureRow({ bindingBasis: 'submission-release-payload-sha256' }),
    ]);

    const res = await verifySignatureIntegrity(1, ORG);

    expect(computeVersionBindingDigest).not.toHaveBeenCalled();
    expect(res.valid).toBe(true);
    expect(res.details.contentBinding).not.toBe('BROKEN');
    expect(res.bindingVerified).toBe(false);
    // This basis IS a digest of content — of the release package — so unlike the
    // ledger basis it does attest to content; this verifier just cannot re-derive it.
    expect(res.attestsToContent).toBe(true);
    expect(res.details.bindingBasis).toBe('submission-release-payload-sha256');
  });

  it('still re-derives, and still detects tampering, for a document-version basis', async () => {
    selectResult.mockResolvedValueOnce([
      signatureRow({ bindingBasis: 'document-version-content-sha256' }),
    ]);
    computeVersionBindingDigest.mockResolvedValueOnce('d'.repeat(64));

    const res = await verifySignatureIntegrity(1, ORG);

    expect(computeVersionBindingDigest).toHaveBeenCalledWith(100);
    expect(res.valid).toBe(false);
    expect(res.details.contentBinding).toBe('BROKEN');
  });
});

describe('verifySignatureIntegrity — tenant boundary', () => {
  /*
   * electronic_signatures.id is a SERIAL, and the live route
   * (GET /api/auth/enterprise/electronic-signature/:id/verify) passed
   * parseInt(req.params.id) straight in. The read selected on that id ALONE, so
   * any authenticated user of any tenant could count upwards and read another
   * tenant's signer_name, signed_at, signature_type and signature_meaning.
   */
  it('constrains the read to the organization', async () => {
    selectResult.mockResolvedValueOnce([signatureRow()]);
    computeVersionBindingDigest.mockResolvedValueOnce(BOUND_DIGEST);

    await verifySignatureIntegrity(1, ORG);

    expect(whereClauses).toHaveLength(1);
    expect(columnsOf(whereClauses[0])).toContain('organization_id');
  });

  it('refuses without organization context rather than reading across tenants', async () => {
    const res = await verifySignatureIntegrity(1, null);

    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/organization/i);
    // Fails closed: no query is issued at all.
    expect(whereClauses).toHaveLength(0);
    expect(selectResult).not.toHaveBeenCalled();
  });

  it('refuses a non-numeric signature id rather than querying on NaN', async () => {
    const res = await verifySignatureIntegrity(Number.NaN, ORG);

    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/signature id/i);
    expect(selectResult).not.toHaveBeenCalled();
  });
});
