/**
 * An exported dossier must not assert a count it never measured.
 *
 * ## What this test is for
 *
 * `loadDecisions` selected fourteen columns `public.decision_records` does not
 * have — the retired drizzle shape, alive only in a test fixture on no applier
 * — so the query raised 42703 on every call, the catch returned `[]`, and
 * `summarizeDecisions` manufactured seven zeros from it. Those zeros shipped:
 *
 *   GET /api/ana-ri/documents/:artifactId/lineage-dossier.xml  ->  HTTP 200
 *   <Decisions count="0" anaAuthored="0" humanAuthored="0" humanDecided="0"
 *              approved="0" rejected="0" pending="0">
 *
 * in a namespaced regulatory metadata file, with nothing marking them
 * unmeasured. The same zeros reached a Part 11 sealed PDF: withholding the +15
 * confidence bonus still left 80 against a threshold of 70, so the run sealed
 * with "Decisions (total) 0" under a disclosure line reading "Every figure
 * links to its source record".
 *
 * The contract is the one `docx-ledger-collector` already states for its audit
 * log and signatures: a count is a claim.
 *
 * @module server/services/ana/__tests__/lineage-dossier-decisions-unavailable
 */

import { describe, expect, it } from 'vitest';
import { summarizeDecisions } from '../lineage-dossier';
import { serializeDocumentLineageDossierXml } from '../lineage-dossier-xml';
import { lineageTraceConfidence } from '../../report-os/lineage-trace-report';

/** The smallest dossier the renderers accept, with the decision read failed. */
function dossierWithDecisions(unavailable: string | null): any {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-09-28T00:00:00.000Z',
    threadId: null,
    ledger: {
      artifact: { artifactPk: 1, artifactId: 'a1', title: 'T', version: 1, status: 'draft', ctdSection: null },
      organization: { organizationId: 1, uuid: null, name: 'Org' },
      project: { projectId: null, name: null },
      citations: null,
      authoringPlan: null,
      auditLog: [], auditLogUnavailable: null,
      signatures: [], signaturesUnavailable: null,
      proposals: [],
      runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] },
    },
    versionHistory: [],
    decisions: [],
    decisionSummary: summarizeDecisions([], unavailable),
    provenanceEvents: [],
    reasoning: [],
    humanControls: [],
    dataLineage: [],
    retainedTurnRecords: [],
  };
}

describe('summarizeDecisions', () => {
  it('carries the reason the read failed, alongside the zeros it did not measure', () => {
    const s = summarizeDecisions([], 'column "context_type" does not exist');
    expect(s.unavailable).toBe('column "context_type" does not exist');
    expect(s.total).toBe(0);
  });

  it('reports a genuinely empty read as measured', () => {
    expect(summarizeDecisions([]).unavailable).toBeNull();
  });
});

describe('the exported XML', () => {
  it('states the read failed instead of printing seven zeros', () => {
    const xml = serializeDocumentLineageDossierXml(dossierWithDecisions('column "context_type" does not exist'));

    expect(xml).toContain('unavailable="true"');
    expect(xml).toContain('context_type');
    // The claim that must not appear in an exported regulatory artifact.
    expect(xml).not.toContain('<Decisions count="0"');
    expect(xml).not.toMatch(/anaAuthored="0"/);
  });

  it('still prints the rollup when the read succeeded and is genuinely empty', () => {
    const xml = serializeDocumentLineageDossierXml(dossierWithDecisions(null));
    expect(xml).toContain('<Decisions count="0"');
    expect(xml).not.toContain('unavailable="true"');
  });
});

describe('lineageTraceConfidence', () => {
  /* The trace's confidence is the measured provenance completeness (P-26).
     An unmeasured decision read leaves the trace unmeasured in full, so there
     is no confidence and the run cannot reach final (requireConfidence). */
  const complete = {
    percent: 100, contentLength: 10, attributedChars: 10, unattributedChars: 0, staleChars: 0,
    byKind: { fromSources: 0, authorAsserted: 10, machineDrafted: 0, machineDraftedUnaccepted: 0 },
  };

  it('is no figure at all on a dossier whose decision read failed', () => {
    expect(lineageTraceConfidence({ ...dossierWithDecisions('read failed'), provenanceCompleteness: complete })).toBeNull();
  });

  it('is the measured completeness for a dossier whose decisions were genuinely read', () => {
    expect(lineageTraceConfidence({ ...dossierWithDecisions(null), provenanceCompleteness: complete })).toBe(100);
  });
});
