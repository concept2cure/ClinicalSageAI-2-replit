/**
 * The evidence & provenance trace says the e-signatures could not be read —
 * with the reason — when their read failed; it never prints "Signatures 0" or
 * "No e-signatures on any version" for a read that did not happen.
 *
 * The AnALedger carries `signaturesUnavailable` (WO-16B finding 10) and the
 * DOCX export refuses on it, but until 2026-10-15 dossierToRenderedReport read
 * only `ledger.signatures.length`: a failed signatures query produced a sealable
 * report with the metric "Signatures 0" and the gap "No e-signatures on any
 * version — No 21 CFR Part 11 signature has been applied", under a disclosure
 * reading "Every figure links to its source record".
 *
 * The reason is stated the way this report states an unread decision record:
 * in words, with the database's own text kept to the ledger XML and the log.
 */
import { describe, expect, it } from 'vitest';
import { dossierToRenderedReport } from '../lineage-trace-report.js';
import type { DocumentLineageDossier } from '../../ana/lineage-dossier.js';
import type { ArtifactLedger } from '../../export/docx-ledger-collector.js';
import type { ReportBlock, RenderedReport } from '../render/types.js';

const REASON = '42501: permission denied for table concept2cure_signatures';

function dossier(signaturesUnavailable: string | null, signatures: ArtifactLedger['signatures'] = []): DocumentLineageDossier {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-10-15T00:00:00.000Z',
    threadId: null,
    ledger: {
      schemaVersion: '1.0',
      generatedAt: '2026-10-15T00:00:00.000Z',
      artifact: {
        artifactId: 'artifact_abc', artifactPk: 1, organizationId: 10, projectId: 5, title: 'Clinical Overview',
        ctdSection: '2.5', type: 'ectd_section', category: 'clinical', status: 'draft', version: 1, contentHash: 'h1',
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', publishedAt: null, lockedAt: null,
      },
      organization: { organizationId: 10, name: 'Acme Bio', uuid: 'u-1' },
      project: { projectId: 5, name: 'IND-123' },
      citations: null,
      authoringPlan: null,
      authoringPlanUnavailable: null,
      auditLog: [],
      auditLogUnavailable: null,
      signatures,
      signaturesUnavailable,
      proposals: [],
      proposalsUnavailable: null,
      runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] },
      runsUnavailable: null,
    },
    versionHistory: [],
    decisions: [],
    decisionSummary: { unavailable: null, total: 0, anaAuthored: 0, humanAuthored: 0, humanDecided: 0, approved: 0, rejected: 0, pending: 0 },
    provenanceEvents: [],
    reasoning: [],
    humanControls: [],
    dataLineage: [],
  };
}

const META = { reportTypeId: 'provenance.evidence_trace_report', reportTypeLabel: 'Evidence & Provenance Trace Report', status: 'partial' as const };

const blocks = (r: RenderedReport): ReportBlock[] => r.sections.flatMap((s) => s.blocks);
const metric = (r: RenderedReport, label: string) =>
  blocks(r).find((b): b is Extract<ReportBlock, { kind: 'metric' }> => b.kind === 'metric' && b.label === label);
const gaps = (r: RenderedReport) =>
  blocks(r).flatMap((b) => (b.kind === 'gap-list' ? b.items : []));
const disclosure = (r: RenderedReport) =>
  blocks(r).find((b): b is Extract<ReportBlock, { kind: 'disclosure' }> => b.kind === 'disclosure')!;

describe('lineage trace report: unread signatures', () => {
  it('the Signatures metric says not read, with the reason — never 0', () => {
    const r = dossierToRenderedReport(dossier(REASON), META);
    const m = metric(r, 'Signatures');
    expect(m?.value, 'a failed signatures read was printed as a count').not.toBe(0);
    expect(m?.value).toBe('not read — the e-signature record could not be read');
  });

  it('the gaps say the signatures could not be read, not that none were applied', () => {
    const r = dossierToRenderedReport(dossier(REASON), META);
    const titles = gaps(r).map((g) => g.title);
    expect(titles).not.toContain('No e-signatures on any version');
    const gap = gaps(r).find((g) => /could not be read/.test(g.title));
    expect(gap?.title).toBe('E-signatures could not be read');
    expect(gap?.message).toMatch(/the e-signature record could not be read, so whether any version .* is signed is not known/);
  });

  it('the disclosure claims no validation and says why the signatures are unknown', () => {
    const d = disclosure(dossierToRenderedReport(dossier(REASON), META));
    expect(d.validated).toBe(false);
    expect(d.note).toMatch(/the e-signature record could not be read/);
  });

  it('the database text does not reach the report', () => {
    expect(JSON.stringify(dossierToRenderedReport(dossier(REASON), META))).not.toMatch(/permission denied|42501/);
  });

  it('a read that ran and found none still says none were applied', () => {
    const r = dossierToRenderedReport(dossier(null), META);
    expect(metric(r, 'Signatures')?.value).toBe(0);
    expect(gaps(r).map((g) => g.title)).toContain('No e-signatures on any version');
    expect(disclosure(r).note).not.toMatch(/could not be read/);
  });
});
