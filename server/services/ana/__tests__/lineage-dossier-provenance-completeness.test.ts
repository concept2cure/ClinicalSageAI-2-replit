/**
 * The lineage dossier measures the document's provenance completeness from the
 * span lineage (P-26, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08).
 *
 * The evidence & provenance trace requires a confidence, and P-26 decided that
 * it is "the lineage engine's measured provenance completeness". The lineage
 * engine's measure is `summarizeDocumentAttribution`
 * (clinical-regulatory-evidence/span-lineage.service.ts): every character of a
 * document's current text partitioned by the provenance its span lineage
 * records. The dossier carries it as `provenanceCompleteness`, read over the
 * artifact's own row (document_table 'concept2cure_artifacts', its numeric id)
 * and the length of its current content. A read that fails leaves it null —
 * not measured — never a zero.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  contentLength: 200 as number | null,
  spans: [] as Array<Record<string, unknown>>,
  failSpans: false,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../../db/runtime.js', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      db.queries.push({ sql, params });
      if (/char_length\(content\)/.test(sql)) {
        return db.contentLength == null ? { rows: [], rowCount: 0 } : { rows: [{ len: db.contentLength }], rowCount: 1 };
      }
      if (/FROM document_span_lineage/.test(sql)) {
        if (db.failSpans) throw Object.assign(new Error('relation "document_span_lineage" does not exist'), { code: '42P01' });
        return { rows: db.spans, rowCount: db.spans.length };
      }
      return { rows: [], rowCount: 0 };
    },
  }),
}));
vi.mock('../turn-record-verify.js', () => ({ listTurnRecords: async () => [] }));
vi.mock('../../export/docx-ledger-collector.js', () => ({
  collectArtifactLedger: async () => ({
    schemaVersion: '1.0',
    generatedAt: '2026-10-08T00:00:00.000Z',
    artifact: {
      artifactId: 'artifact_abc', artifactPk: 41, organizationId: 7, projectId: 5, title: 'Clinical Overview',
      ctdSection: '2.5', type: 'ectd_section', category: 'clinical', status: 'draft', version: 1, contentHash: 'h1',
      createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z', publishedAt: null, lockedAt: null,
    },
    organization: { organizationId: 7, name: 'Acme Bio', uuid: 'u-1' },
    project: { projectId: 5, name: 'IND-123' },
    citations: null, authoringPlan: null, auditLog: [], auditLogUnavailable: null,
    signatures: [], signaturesUnavailable: null, proposals: [],
    runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] },
  }),
}));

import { buildDocumentLineageDossier } from '../lineage-dossier.js';

const span = (charStart: number, charEnd: number, provenanceKind: string) => ({
  id: `${charStart}`, document_table: 'concept2cure_artifacts', document_id: '41', char_start: charStart, char_end: charEnd,
  provenance_kind: provenanceKind, reference_id: provenanceKind === 'cre_evidence_source' ? '9' : null,
  payload_sha256: 'abc', current_checksum: provenanceKind === 'cre_evidence_source' ? 'abc' : null, source_title: null,
  usage: provenanceKind === 'cre_evidence_source' ? 'quoted' : 'asserted', confidence: null,
});

beforeEach(() => {
  db.contentLength = 200;
  db.spans = [];
  db.failSpans = false;
  db.queries.length = 0;
});

describe('buildDocumentLineageDossier — provenance completeness', () => {
  it('measures the share of the current text whose origin the span lineage records', async () => {
    db.spans = [span(0, 150, 'author_assertion'), span(150, 180, 'cre_evidence_source')];
    const d = await buildDocumentLineageDossier('artifact_abc', 7);
    expect(d!.provenanceCompleteness).toMatchObject({
      percent: 90,
      contentLength: 200,
      attributedChars: 180,
      unattributedChars: 20,
      byKind: { fromSources: 30, authorAsserted: 150, machineDrafted: 0, machineDraftedUnaccepted: 0 },
    });
    // Read over the artifact's own row and its tenant: the numeric id, never the external id.
    const lengthRead = db.queries.find((q) => /char_length\(content\)/.test(q.sql))!;
    expect(lengthRead.params).toEqual([41, 7]);
    const spanRead = db.queries.find((q) => /FROM document_span_lineage/.test(q.sql))!;
    expect(spanRead.params).toEqual([7, 'concept2cure_artifacts', '41']);
  });

  it('a document with no span lineage measures 0 — the text is there and none of it is traced', async () => {
    const d = await buildDocumentLineageDossier('artifact_abc', 7);
    expect(d!.provenanceCompleteness).toMatchObject({ percent: 0, contentLength: 200, attributedChars: 0 });
  });

  it('a lineage read that fails is not measured (null), never a zero', async () => {
    db.failSpans = true;
    const d = await buildDocumentLineageDossier('artifact_abc', 7);
    expect(d!.provenanceCompleteness).toBeNull();
  });

  it('a document with no text is measured as having nothing to measure', async () => {
    db.contentLength = 0;
    const d = await buildDocumentLineageDossier('artifact_abc', 7);
    expect(d!.provenanceCompleteness?.percent).toBeNull();
  });
});
