/**
 * An artifact whose citation run has no recorded row carries no citation
 * counts in its AnALedger — not zeros.
 *
 * loadArtifact (docx-ledger-collector) LEFT JOINs the artifact's
 * citation_run_id onto ana_artifact_citation_runs, whose counts are NOT NULL.
 * Until 2026-10-15, when the join found no row it still built the citation
 * stats as `Number(r.total_sentences) || 0` and `!!r.filing_blocked`: the
 * embedded ledger read <Stats totalSentences="0" … gapCount="0"
 * filingBlocked="false"/> and the summary "0 sentences — 0 supported, 0
 * contradicted, 0 gaps" — a clean, unblocked run nobody recorded. The counts
 * are now null with the reason, and both renderers say so.
 *
 * Rows are served from the process-wide `pg` stub.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../../../tests/setup';

const artifactRow = (run: Record<string, unknown>) => ({
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
  citations: [{ sentence: 'The primary endpoint was met.', status: 'supported' }],
  citation_run_id: '5f1c2a8e-0000-4000-8000-00000000c1a0',
  citations_at: '2026-09-02T00:00:00.000Z',
  org_name: 'Probe Org',
  org_uuid: null,
  project_name: 'Probe Project',
  ...run,
});

// The LEFT JOIN found no run row: every r.* column is null.
const NO_RUN_ROW = {
  run_row_id: null, ran_against_content_hash: null, total_sentences: null, supported_count: null,
  contradicted_count: null, gap_count: null, total_readiness_delta: null, filing_blocked: null,
};
const RUN_ROW = {
  run_row_id: '5f1c2a8e-0000-4000-8000-00000000c1a0', ran_against_content_hash: 'h', total_sentences: 4,
  supported_count: 2, contradicted_count: 1, gap_count: 1, total_readiness_delta: -3, filing_blocked: true,
};

function serve(row: Record<string, unknown>) {
  (mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
    const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
    if (/FROM concept2cure_artifacts a/i.test(text)) return Promise.resolve({ rows: [row], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const originalQuery = mockPool.query;
let collectArtifactLedger: typeof import('../docx-ledger-collector')['collectArtifactLedger'];
let serializeAnALedgerXml: typeof import('../docx-ledger-xml')['serializeAnALedgerXml'];
let renderProvenanceSummaryText: typeof import('../docx-ledger-export')['renderProvenanceSummaryText'];

beforeAll(async () => {
  ({ collectArtifactLedger } = await import('../docx-ledger-collector'));
  ({ serializeAnALedgerXml } = await import('../docx-ledger-xml'));
  ({ renderProvenanceSummaryText } = await import('../docx-ledger-export'));
  await import('../../ana/authoring-plan-generator');
}, 60_000);
afterAll(() => {
  (mockPool as { query: unknown }).query = originalQuery;
});

describe('AnALedger citation stats with no recorded citation run', () => {
  it('records the counts as null with the reason, never zero', async () => {
    serve(artifactRow(NO_RUN_ROW));
    const c = (await collectArtifactLedger('art-1', 7))!.citations!;
    expect(c.totalSentences, 'a missing citation run was recorded as 0 sentences').toBeNull();
    expect(c).toMatchObject({
      statsNotRecorded: 'no citation run recorded',
      supportedCount: null,
      contradictedCount: null,
      gapCount: null,
      totalReadinessDelta: null,
      filingBlocked: null,
    });
    // What the artifact row itself holds is still reported.
    expect(c.citationRunId).toBe('5f1c2a8e-0000-4000-8000-00000000c1a0');
    expect(c.sentences).toHaveLength(1);
  });

  it('the XML and the summary say the counts were not recorded, and print none', async () => {
    serve(artifactRow(NO_RUN_ROW));
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    const xml = serializeAnALedgerXml(ledger);
    expect(xml).toContain('<Stats recorded="false" reason="no citation run recorded"/>');
    expect(xml).not.toMatch(/totalSentences=|filingBlocked=/);
    const text = renderProvenanceSummaryText(ledger);
    expect(text).toContain('Counts: not recorded — no citation run recorded');
    expect(text).not.toMatch(/0 sentences|Readiness delta: 0/);
  });

  it('a recorded run still reports its counts', async () => {
    serve(artifactRow(RUN_ROW));
    const ledger = (await collectArtifactLedger('art-1', 7))!;
    expect(ledger.citations).toMatchObject({
      statsNotRecorded: null,
      totalSentences: 4,
      supportedCount: 2,
      contradictedCount: 1,
      gapCount: 1,
      totalReadinessDelta: -3,
      filingBlocked: true,
    });
    expect(serializeAnALedgerXml(ledger)).toContain(
      '<Stats totalSentences="4" supportedCount="2" contradictedCount="1" gapCount="1" totalReadinessDelta="-3" filingBlocked="true"/>',
    );
    expect(renderProvenanceSummaryText(ledger)).toContain('4 sentences — 2 supported, 1 contradicted, 1 gaps');
  });
});
