/**
 * registerExportGovernanceQuick records the caller's export metadata — the
 * review attestation an export passed — on the governed export record itself.
 *
 * Until 2026-10-15 it took no metadata. A placed eCTD package export therefore
 * recorded the review assertion that let it through only on the route's
 * ectd_export_generated audit row, which is written after the registry and
 * whose failure is logged and ignored; the governed record — the artifact row
 * and its regulatory_audit_logs EXPORT row, written in one transaction that
 * fails the export when it fails — carried none of it. Caller metadata never
 * shadows the record's own integrity fields.
 *
 * The pool is mocked; the assertions read the parameters of the INSERTs it
 * received, which is what lands in the record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [{ id: 1 }], rowCount: 1 })),
}));
vi.mock('../../../db', () => ({
  getPool: () => ({ connect: async () => ({ query, release: () => {} }) }),
}));
vi.mock('../../generation-guard.js', () => ({
  emitTraceEvent: vi.fn(async () => {}),
  createTraceId: () => 'trace-1',
}));

import { registerExportGovernanceQuick } from '../exportGovernance';

const HASH = 'b'.repeat(64);
const ATTESTATION = {
  authorization: 'caller-asserted-review',
  assertedByUserId: 3,
  aiGenerated: true,
  reviewerName: 'Dana Reviewer',
  reviewerRole: 'regulatory_affairs',
  reviewTimestamp: '2026-10-15T09:00:00.000Z',
};

/** The JSON parameters of the INSERT into `table`, parsed. */
function jsonParamsOf(table: string): Array<Record<string, unknown>> {
  const call = query.mock.calls.find((c) => new RegExp(`INSERT INTO ${table}\\b`).test(String((c as unknown[])[0])));
  expect(call, `no INSERT into ${table}`).toBeTruthy();
  return ((call as unknown[])[1] as unknown[])
    .filter((p): p is string => typeof p === 'string' && p.startsWith('{'))
    .map((p) => JSON.parse(p) as Record<string, unknown>);
}

beforeEach(() => vi.clearAllMocks());

describe('registerExportGovernanceQuick — caller metadata on the governed record', () => {
  it('writes the review attestation into the artifact metadata and the EXPORT audit row', async () => {
    await registerExportGovernanceQuick({
      organizationId: 7,
      projectId: 42,
      userId: 3,
      userName: 'Avery Author',
      title: 'eCTD Package: seq-0001.zip',
      exportFormat: 'zip',
      exportFilename: 'seq-0001.zip',
      exportFileSize: 1024,
      exportHash: HASH,
      docType: 'ectd_package',
      backendRoute: '/api/ectd/export/1',
      metadata: { reviewAttestation: ATTESTATION, exportHash: 'c'.repeat(64) },
    });

    const artifactMeta = jsonParamsOf('concept2cure_artifacts').find((j) => j.source === 'governed_export');
    expect(artifactMeta?.reviewAttestation, 'the governed artifact record carries no review attestation').toEqual(ATTESTATION);
    // The record's own integrity hash wins over anything the caller passes.
    expect(artifactMeta?.exportHash).toBe(HASH);

    const auditMeta = jsonParamsOf('regulatory_audit_logs').find((j) => j.source === 'governed_export');
    expect(auditMeta?.reviewAttestation).toEqual(ATTESTATION);
    expect(auditMeta?.backendRoute).toBe('/api/ectd/export/1');
  });

  it('records no review fields a caller did not state', async () => {
    await registerExportGovernanceQuick({
      organizationId: 7,
      projectId: 42,
      userId: 3,
      userName: 'Avery Author',
      title: 'RTM',
      exportFormat: 'csv',
      exportFilename: 'rtm.csv',
      exportFileSize: 10,
      exportHash: HASH,
      docType: 'rtm',
      backendRoute: '/api/rtm/export',
    });
    const artifactMeta = jsonParamsOf('concept2cure_artifacts').find((j) => j.source === 'governed_export');
    expect(artifactMeta).not.toHaveProperty('reviewAttestation');
    // Not stated is not "AI-generated" and not "review not approved".
    expect(artifactMeta?.aiGenerated).toBeNull();
    expect(artifactMeta?.humanReviewApproved).toBeNull();
    const auditNewValue = jsonParamsOf('regulatory_audit_logs').find((j) => j.exportHash === HASH);
    expect(auditNewValue?.aiGenerated).toBeNull();
    expect(auditNewValue?.humanReviewApproved).toBeNull();
  });
});
