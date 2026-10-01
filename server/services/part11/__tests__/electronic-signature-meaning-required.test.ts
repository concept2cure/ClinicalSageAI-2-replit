/**
 * §11.50(a)(3) at the one writer: every electronic_signatures row states a
 * meaning from the closed vocabulary (security audit 2026-09-24 DP-55, plan
 * P1-42).
 *
 * `persistElectronicSignature` is the single INSERT into electronic_signatures.
 * Until P1-42 it wrote `record.signatureMeaning ?? null`: the column is
 * nullable, so a caller that forgot the meaning — POST /api/esignature/sign did,
 * whenever the body carried none — produced a signature that says nothing
 * about what it means. The governed `sign` path refused that one level up
 * (persistGovernedActionSignature, P1-21); the document path and every future
 * caller did not. The writer now refuses it before the INSERT is issued.
 *
 * The one row that may carry none is a governed revocation
 * (GOVERNED_REVOCATION_SIGNATURE_TYPE): it withdraws a signature rather than
 * asserting a meaning, and its manifest records the act. If it does carry one,
 * that meaning is held to the same vocabulary.
 *
 * The client is a recording double: a test can tell "refused before any query"
 * from "reached the INSERT".
 */
import { describe, it, expect, vi } from 'vitest';
import {
  persistElectronicSignature,
  SignatureMeaningError,
  GOVERNED_REVOCATION_SIGNATURE_TYPE,
  type ElectronicSignatureRecord,
} from '../signature-persistence';

function recordingClient() {
  const query = vi.fn(async () => ({ rows: [{ id: 501, signed_at: new Date('2026-10-01T00:00:00Z') }] }));
  return { client: { query }, query };
}

function record(overrides: Partial<ElectronicSignatureRecord> = {}): ElectronicSignatureRecord {
  return {
    documentId: 10,
    versionId: 1,
    bindingBasis: 'document-version-content-sha256',
    signatureType: 'approval',
    signaturePurpose: 'approval',
    signerId: 7,
    signerName: 'A Signer',
    signerEmail: 's@x.test',
    authenticationMethod: 'password',
    authenticationTimestamp: new Date('2026-10-01T00:00:00Z'),
    secondFactorVerified: false,
    signatureHash: 'h'.repeat(64),
    signatureMeaning: 'approval',
    signatureManifest: { documentId: 10 },
    isValid: true,
    signedAt: new Date('2026-10-01T00:00:00Z'),
    boundPayloadDigest: 'd'.repeat(64),
    organizationId: 3,
    ...overrides,
  };
}

describe('persistElectronicSignature: a signature states its meaning', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
  ])('refuses a row whose meaning is %s, before any query (SIGNATURE_MEANING_REQUIRED)', async (_l, meaning) => {
    const { client, query } = recordingClient();
    const attempt = persistElectronicSignature(client, record({ signatureMeaning: meaning as string | null | undefined }));
    await expect(attempt).rejects.toBeInstanceOf(SignatureMeaningError);
    await expect(attempt).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a meaning outside the closed vocabulary, before any query (SIGNATURE_MEANING_UNKNOWN)', async () => {
    const { client, query } = recordingClient();
    await expect(
      persistElectronicSignature(client, record({ signatureMeaning: 'I approve' })),
    ).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_UNKNOWN' });
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['approval', 'review', 'release', 'APPROVED', 'RESPONSIBILITY'])(
    'writes a vocabulary meaning (%s) verbatim into signature_meaning',
    async (meaning) => {
      const { client, query } = recordingClient();
      await expect(persistElectronicSignature(client, record({ signatureMeaning: meaning }))).resolves.toMatchObject({ id: 501 });
      expect(query).toHaveBeenCalledTimes(1);
      const params = (query.mock.calls[0] as unknown as [string, unknown[]])[1];
      expect(params[15]).toBe(meaning); // $16 signature_meaning
    },
  );
});

describe('persistElectronicSignature: a governed revocation', () => {
  it('may carry no meaning: it withdraws a signature, it does not assert one', async () => {
    const { client, query } = recordingClient();
    await expect(
      persistElectronicSignature(
        client,
        record({ signatureType: GOVERNED_REVOCATION_SIGNATURE_TYPE, signatureMeaning: null, documentId: null, versionId: null, signedTarget: 'protocol-document:4' }),
      ),
    ).resolves.toMatchObject({ id: 501 });
    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1][15]).toBeNull();
  });

  it('is held to the vocabulary when it does carry a meaning', async () => {
    const { client, query } = recordingClient();
    await expect(
      persistElectronicSignature(
        client,
        record({ signatureType: GOVERNED_REVOCATION_SIGNATURE_TYPE, signatureMeaning: 'because', documentId: null, versionId: null, signedTarget: 'protocol-document:4' }),
      ),
    ).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_UNKNOWN' });
    expect(query).not.toHaveBeenCalled();
  });

  it('the exemption is the revocation type only: another type with no meaning is refused', async () => {
    const { client, query } = recordingClient();
    await expect(
      persistElectronicSignature(client, record({ signatureType: 'governed-action', signatureMeaning: null, documentId: null, versionId: null, signedTarget: 'program:4' })),
    ).rejects.toMatchObject({ code: 'SIGNATURE_MEANING_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
  });
});
