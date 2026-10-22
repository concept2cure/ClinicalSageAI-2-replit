/**
 * A decision record with no recommendation summary or no confidence level is
 * stated as "not recorded" in the lineage dossier, its XML and the evidence
 * trace report.
 *
 * Until 2026-10-15 loadDecisions mapped `recommendation_summary ?? ''` and
 * `confidence_level ?? 'provisional'`: a decision whose summary was never
 * recorded rendered as a blank cell in the dossier, its exported XML and the
 * sealable trace report, and one with no confidence level was printed with the
 * level 'provisional' — a confidence nobody assigned.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/runtime.js', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (/FROM decision_records/.test(sql)) {
        return {
          rows: [
            {
              id: 'dec-1', decision_code: 'D-1', title: 'Ground the efficacy claim', domain_track: 'authoring',
              recommendation_type: null, recommendation_summary: null, confidence_level: null, evidence_basis: null,
              action_state: 'recommended_only', approved_by: null, approved_at: null, rejection_reason: null,
              executed_artifact_version: null, decision_context: { artifactId: 'artifact_abc' }, decided_by: null,
              created_at: '2026-10-15T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  }),
}));
vi.mock('../turn-record-verify.js', () => ({ listTurnRecords: async () => [] }));
vi.mock('../../export/docx-ledger-collector.js', () => ({
  collectArtifactLedger: async () => ({
    schemaVersion: '1.0',
    generatedAt: '2026-10-15T00:00:00.000Z',
    artifact: {
      artifactId: 'artifact_abc', artifactPk: 41, organizationId: 7, projectId: 5, title: 'Clinical Overview',
      ctdSection: '2.5', type: 'ectd_section', category: 'clinical', status: 'draft', version: 1, contentHash: 'h1',
      createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z', publishedAt: null, lockedAt: null,
    },
    organization: { organizationId: 7, name: 'Acme Bio', uuid: 'u-1' },
    project: { projectId: 5, name: 'IND-123' },
    citations: null, authoringPlan: null, authoringPlanUnavailable: null, auditLog: [], auditLogUnavailable: null,
    signatures: [], signaturesUnavailable: null, proposals: [], proposalsUnavailable: null,
    runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] }, runsUnavailable: null,
  }),
}));

import { buildDocumentLineageDossier } from '../lineage-dossier.js';
import { serializeDocumentLineageDossierXml } from '../lineage-dossier-xml.js';
import { dossierToRenderedReport } from '../../report-os/lineage-trace-report.js';

describe('lineage dossier: a decision field nobody recorded', () => {
  it('states the summary and the confidence as not recorded — never blank, never provisional', async () => {
    const dossier = (await buildDocumentLineageDossier('artifact_abc', 7))!;
    const [d] = dossier.decisions;
    expect(d.recommendationSummary, 'an unrecorded summary rendered blank').toBe('not recorded');
    expect(d.confidence, 'an unrecorded confidence was given a level').toBe('not recorded');

    const xml = serializeDocumentLineageDossierXml(dossier);
    expect(xml).toContain('<RecommendationSummary>not recorded</RecommendationSummary>');
    expect(xml).toContain('confidence="not recorded"');
    expect(xml).not.toContain('provisional');

    const report = dossierToRenderedReport(dossier, {
      reportTypeId: 'provenance.evidence_trace_report',
      reportTypeLabel: 'Evidence & Provenance Trace Report',
      status: 'partial',
    });
    const table = report.sections.find((s) => s.id === 'decisions')!.blocks[0];
    if (table.kind !== 'table') throw new Error('the decisions section holds no table');
    // Columns: Authored by, Decided by, Context, Recommendation, Confidence, State.
    expect(table.rows[0][3]).toBe('not recorded');
    expect(table.rows[0][4]).toBe('not recorded');
  });
});
