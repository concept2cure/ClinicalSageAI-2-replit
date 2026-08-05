/**
 * Attestation report tests — verifies INTACT/BROKEN/EMPTY/UNVERIFIABLE
 * classification and HMAC signature roundtrip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('AUDIT_ATTESTATION_KEY', 'a-very-secret-attestation-key-32-chars');

import {
  generateAttestation,
  verifyAttestationSignature,
  AttestationKeyMissingError,
} from '../attestation-report.service';

const ORG = { id: 99, slug: 'acme', name: 'Acme Inc' };

function client(rowsByQuery: Map<string, any[]>) {
  return {
    query: vi.fn(async (sqlOrConfig: any, _params?: any[]) => {
      const sql = typeof sqlOrConfig === 'string' ? sqlOrConfig : sqlOrConfig.text;
      for (const [key, rows] of rowsByQuery.entries()) {
        if (sql.includes(key)) return { rows };
      }
      return { rows: [] };
    }),
  } as any;
}

describe('generateAttestation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns EMPTY when the chain has zero rows', async () => {
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(report.attestation).toBe('EMPTY');
    expect(report.totalEntries).toBe(0);
    expect(report.firstSequenceNumber).toBeNull();
    expect(report.windowStart).toBeNull();
  });

  it('returns INTACT when every previous_hash matches the prior record_hash', async () => {
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        [
          'audit_events',
          [
            { id: 'a', sequence_number: 1, record_hash: 'h1', previous_hash: null, timestamp: '2026-01-01T00:00:00Z' },
            { id: 'b', sequence_number: 2, record_hash: 'h2', previous_hash: 'h1', timestamp: '2026-01-02T00:00:00Z' },
            { id: 'c', sequence_number: 3, record_hash: 'h3', previous_hash: 'h2', timestamp: '2026-01-03T00:00:00Z' },
          ],
        ],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(report.attestation).toBe('INTACT');
    expect(report.totalEntries).toBe(3);
    expect(report.brokenLinks).toBe(0);
    expect(report.firstSequenceNumber).toBe(1);
    expect(report.lastSequenceNumber).toBe(3);
  });

  it('detects broken links and reports them in samples', async () => {
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        [
          'audit_events',
          [
            { id: 'a', sequence_number: 1, record_hash: 'h1', previous_hash: null, timestamp: '2026-01-01T00:00:00Z' },
            // Tamper: previous_hash should be 'h1' but is 'WRONG'
            { id: 'b', sequence_number: 2, record_hash: 'h2', previous_hash: 'WRONG', timestamp: '2026-01-02T00:00:00Z' },
          ],
        ],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(report.attestation).toBe('BROKEN');
    expect(report.brokenLinks).toBe(1);
    expect(report.brokenLinkSamples[0].id).toBe('b');
  });

  it('produces a verifiable HMAC signature', async () => {
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(report.signature.algorithm).toBe('HMAC-SHA256');
    expect(verifyAttestationSignature(report)).toBe(true);
  });

  it('signature fails verification if the body is tampered with', async () => {
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    const tampered = { ...report, totalEntries: 99999 };
    expect(verifyAttestationSignature(tampered)).toBe(false);
  });

  /*
   * The UNVERIFIABLE cases.
   *
   * These are the ones that were wrong. An unhashed trail produced zero broken
   * links and went out signed as INTACT — a claim about tamper-evidence with no
   * evidence behind it, in the document a customer hands an inspector.
   *
   * It failed silently in two independent ways, which is why no existing test
   * caught it: with every record_hash NULL, `prevHash` stays null so the
   * `expectedPrev !== null` guard never fires, and every `previous_hash` is null
   * so the second guard never fires either. Both had to be wrong for the bug to
   * exist, and either one alone would have hidden it.
   */
  it('returns UNVERIFIABLE, NOT INTACT, when no entry carries a hash', async () => {
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        [
          'audit_events',
          [
            { id: 'a', sequence_number: 1, record_hash: null, previous_hash: null, timestamp: '2026-01-01T00:00:00Z' },
            { id: 'b', sequence_number: 2, record_hash: null, previous_hash: null, timestamp: '2026-01-02T00:00:00Z' },
          ],
        ],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);

    expect(report.attestation, 'an unhashed trail was attested as intact').toBe('UNVERIFIABLE');
    expect(report.totalEntries).toBe(2);
    expect(report.hashedEntries).toBe(0);
    expect(report.unhashedEntries).toBe(2);
    // The reader must be told why, not just handed a verdict.
    expect(report.unverifiableReason).toContain('cannot be attested');
  });

  it('returns UNVERIFIABLE when the trail is only PARTIALLY hashed', async () => {
    // The later links can be checked; the earlier span cannot be attested at
    // all. "INTACT" over a partially-covered trail is the same overclaim.
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        [
          'audit_events',
          [
            { id: 'a', sequence_number: 1, record_hash: null, previous_hash: null, timestamp: '2026-01-01T00:00:00Z' },
            { id: 'b', sequence_number: 2, record_hash: 'h2', previous_hash: null, timestamp: '2026-01-02T00:00:00Z' },
            { id: 'c', sequence_number: 3, record_hash: 'h3', previous_hash: 'h2', timestamp: '2026-01-03T00:00:00Z' },
          ],
        ],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);

    expect(report.attestation).toBe('UNVERIFIABLE');
    expect(report.hashedEntries).toBe(2);
    expect(report.unhashedEntries).toBe(1);
    // The split is reported so a reader can judge rather than trust.
    expect(report.unverifiableReason).toContain('1 of 3');
  });

  it('EMPTY and UNVERIFIABLE are not the same claim', async () => {
    // EMPTY says something true about the TENANT: no audit history exists.
    // UNVERIFIABLE says something about this REPORT: a history exists and it
    // could not be checked. Collapsing them would re-hide the bug.
    const empty = await generateAttestation(
      client(new Map<string, any[]>([['organizations', [ORG]], ['audit_events', []]])),
      ORG.id,
    );
    const unhashed = await generateAttestation(
      client(
        new Map<string, any[]>([
          ['organizations', [ORG]],
          ['audit_events', [{ id: 'a', sequence_number: 1, record_hash: null, previous_hash: null, timestamp: '2026-01-01T00:00:00Z' }]],
        ]),
      ),
      ORG.id,
    );
    expect(empty.attestation).toBe('EMPTY');
    expect(unhashed.attestation).toBe('UNVERIFIABLE');
  });

  it('the UNVERIFIABLE verdict is inside the signed body, not bolted on after', async () => {
    // A verdict outside the signature could be edited to INTACT in transit
    // without breaking verification — which would defeat the whole fix.
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', [{ id: 'a', sequence_number: 1, record_hash: null, previous_hash: null, timestamp: '2026-01-01T00:00:00Z' }]],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(verifyAttestationSignature(report)).toBe(true);

    const forged = { ...report, attestation: 'INTACT' as const };
    expect(
      verifyAttestationSignature(forged as typeof report),
      'the verdict could be rewritten to INTACT without breaking the signature',
    ).toBe(false);
  });

  it('throws TenantNotFound when org does not exist', async () => {
    const c = client(new Map<string, any[]>([['organizations', []]]));
    await expect(generateAttestation(c, ORG.id)).rejects.toThrow(/not found/);
  });
});

describe('attestation key configuration', () => {
  it('throws AttestationKeyMissingError when env var is absent', async () => {
    vi.stubEnv('AUDIT_ATTESTATION_KEY', '');
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    await expect(generateAttestation(c, ORG.id)).rejects.toBeInstanceOf(
      AttestationKeyMissingError,
    );
    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'a-very-secret-attestation-key-32-chars');
  });
});

describe('key rotation', () => {
  it('embeds the current key id in the signature', async () => {
    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'a-very-secret-attestation-key-32-chars');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_ID', 'k2');
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(report.signature.keyId).toBe('k2');
    expect(verifyAttestationSignature(report)).toBe(true);
  });

  it('verifies a report signed under the previous key', async () => {
    // Step 1: sign under k1.
    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'old-key-32-chars-aaaaaaaaaaaaaaaaa');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_ID', 'k1');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV', '');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV_ID', '');
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    expect(report.signature.keyId).toBe('k1');

    // Step 2: rotate — k2 is now current, k1 is "previous". The old
    // report must still verify.
    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'new-key-32-chars-bbbbbbbbbbbbbbbbb');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_ID', 'k2');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV', 'old-key-32-chars-aaaaaaaaaaaaaaaaa');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV_ID', 'k1');
    expect(verifyAttestationSignature(report)).toBe(true);

    // Reset for other tests.
    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'a-very-secret-attestation-key-32-chars');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_ID', 'k1');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV', '');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV_ID', '');
  });

  it('refuses verification when the report was signed under an unknown key', async () => {
    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'current-key-32-chars-aaaaaaaaaaaa');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_ID', 'k2');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV', '');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_PREV_ID', '');
    const c = client(
      new Map<string, any[]>([
        ['organizations', [ORG]],
        ['audit_events', []],
      ]),
    );
    const report = await generateAttestation(c, ORG.id);
    // Tamper with the keyId so it doesn't match k2 or any configured prev.
    const tampered = { ...report, signature: { ...report.signature, keyId: 'unknown' } };
    expect(verifyAttestationSignature(tampered)).toBe(false);

    vi.stubEnv('AUDIT_ATTESTATION_KEY', 'a-very-secret-attestation-key-32-chars');
    vi.stubEnv('AUDIT_ATTESTATION_KEY_ID', 'k1');
  });
});
