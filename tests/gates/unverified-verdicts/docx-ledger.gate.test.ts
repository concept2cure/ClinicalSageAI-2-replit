/**
 * WO-16B finding 10 — the exported DOCX's AnALedger said `<AuditLog count="0">`
 * and `<Signatures count="0">` when the audit and signature queries FAILED.
 *
 * The collector caught every error from those two loads and returned an empty
 * array — "tolerant of missing tables — anything not migrated yet contributes
 * empty arrays so the ledger still ships". The XML serializer then rendered a
 * count. A count is a claim; a reviewer reading `count="0"` reads "this
 * artifact has no audit history and no signatures", which is not what happened.
 *
 * Failure is injected at the dependency: the process-wide `pg` stub's `query()`
 * rejects the two provenance queries with a Postgres permission error and
 * answers everything else. RED on the pre-fix head: `count="0"` in the XML, a
 * ledger with no way to say otherwise, and a DOCX produced regardless.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../setup';
import { assertNoVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

const denied = (table: string) =>
  Object.assign(new Error(`permission denied for table ${table}`), { code: '42501' });

const artifactRow = {
  id: 11,
  artifact_id: 'art-1',
  organization_id: 7,
  project_id: 3,
  title: 'Module 2.5 Clinical Overview',
  ctd_section: '2.5',
  type: 'section',
  category: 'clinical',
  status: 'draft',
  version: 2,
  content_hash: 'h',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  published_at: null,
  locked_at: null,
  citations: null,
  citation_run_id: null,
  citations_at: null,
  org_name: 'Probe Org',
  org_uuid: null,
  project_name: 'Probe Project',
};

function queryText(arg: unknown): string {
  return typeof arg === 'string' ? arg : String((arg as { text?: string })?.text ?? '');
}

function failProvenanceQueries(err = denied) {
  // Reassigned, not re-implemented: the runtime wraps the stub's query in
  // place at import time (see decision-lineage.gate.test.ts).
  (mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
    const text = queryText(sql);
    if (/FROM regulatory_audit_logs/i.test(text)) return Promise.reject(err('regulatory_audit_logs'));
    if (/FROM concept2cure_signatures/i.test(text)) return Promise.reject(err('concept2cure_signatures'));
    if (/SELECT content\s+FROM concept2cure_artifacts/i.test(text)) return Promise.resolve({ rows: [{ content: 'body' }], rowCount: 1 });
    if (/FROM concept2cure_artifacts a/i.test(text)) return Promise.resolve({ rows: [artifactRow], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

describe('AnALedger: a failed provenance query is "unavailable", never a count', () => {
  beforeEach(() => {
    failProvenanceQueries();
  });

  it('the collector carries the third state for audit log and signatures', async () => {
    const { collectArtifactLedger } = await import('../../../server/services/export/docx-ledger-collector');
    const ledger = await collectArtifactLedger('art-1', 7);
    expect(ledger).not.toBeNull();
    expect(ledger!.auditLogUnavailable).toMatch(/42501/);
    expect(ledger!.signaturesUnavailable).toMatch(/42501/);
    expect(ledger!.auditLog).toEqual([]);
    expect(ledger!.signatures).toEqual([]);
  });

  it('the XML says unavailable, with the reason, and asserts no count', async () => {
    const { collectArtifactLedger } = await import('../../../server/services/export/docx-ledger-collector');
    const { serializeAnALedgerXml } = await import('../../../server/services/export/docx-ledger-xml');
    const xml = serializeAnALedgerXml((await collectArtifactLedger('art-1', 7))!);
    expect(xml).toMatch(/<AuditLog unavailable="true" reason="[^"]*42501[^"]*"\/>/);
    expect(xml).toMatch(/<Signatures unavailable="true" reason="[^"]*42501[^"]*"\/>/);
    expect(xml).not.toMatch(/<AuditLog count=/);
    expect(xml).not.toMatch(/<Signatures count=/);
    assertNoVerdictClaims(xml, 'AnALedger XML (provenance queries failed)');
  });

  it('a missing table is unavailable too — absence of the store is not an empty history', async () => {
    failProvenanceQueries(table => Object.assign(new Error(`relation "${table}" does not exist`), { code: '42P01' }));
    const { collectArtifactLedger } = await import('../../../server/services/export/docx-ledger-collector');
    const ledger = await collectArtifactLedger('art-1', 7);
    expect(ledger!.auditLogUnavailable).toMatch(/42P01/);
    expect(ledger!.signaturesUnavailable).toMatch(/42P01/);
  });

  it('the DOCX export refuses to produce a document whose signature block it cannot substantiate', async () => {
    const { exportArtifactWithLedger } = await import('../../../server/services/export/docx-ledger-export');
    await expect(exportArtifactWithLedger('art-1', 7)).rejects.toMatchObject({
      name: 'VerificationUnavailableError',
    });
  });
});

describe('AnALedger: when the queries ran and found nothing, the count is honest', () => {
  beforeEach(() => {
    (mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
      const text = queryText(sql);
      if (/FROM concept2cure_artifacts a/i.test(text)) return Promise.resolve({ rows: [artifactRow], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it('renders count="0" only for a query that actually returned zero rows', async () => {
    const { collectArtifactLedger } = await import('../../../server/services/export/docx-ledger-collector');
    const { serializeAnALedgerXml } = await import('../../../server/services/export/docx-ledger-xml');
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    expect(ledger.auditLogUnavailable).toBeNull();
    expect(ledger.signaturesUnavailable).toBeNull();
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toContain('<AuditLog count="0">');
    expect(xml).toContain('<Signatures count="0">');
  });
});
