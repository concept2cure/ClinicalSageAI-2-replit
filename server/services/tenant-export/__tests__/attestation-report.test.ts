/**
 * Attestation report tests — verifies INTACT/BROKEN/EMPTY classification
 * and HMAC signature roundtrip.
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
