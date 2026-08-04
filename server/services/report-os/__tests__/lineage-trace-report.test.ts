/**
 * Lineage → Report-OS adapter: confidence + dossier→RenderedReport mapping,
 * proven end-to-end against the REAL seal so we know the governed pipeline
 * captures the dossier's provenance atoms (the whole point of the integration).
 */
import { describe, it, expect } from 'vitest';
import {
  computeLineageConfidence,
  dossierToRenderedReport,
} from '../lineage-trace-report.js';
import {
  buildSealedRecord,
  extractProvenanceAtoms,
  reportIsAiDisclosed,
} from '../sealing/seal.js';
import type { ArtifactLedger } from '../../export/docx-ledger-collector.js';
import type { DocumentLineageDossier } from '../../ana/lineage-dossier.js';

function ledger(): ArtifactLedger {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-08-03T00:00:00.000Z',
    artifact: {
      artifactId: 'artifact_abc',
      artifactPk: 1,
      organizationId: 10,
      projectId: 5,
      title: 'Clinical Overview',
      ctdSection: '2.5',
      type: 'ectd_section',
      category: 'clinical',
      status: 'draft',
      version: 3,
      contentHash: 'hash3',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      publishedAt: null,
      lockedAt: null,
    },
    organization: { organizationId: 10, name: 'Acme Bio', uuid: 'u-1' },
    project: { projectId: 5, name: 'IND-123' },
    citations: null,
    authoringPlan: null,
    auditLog: [],
    signatures: [],
    proposals: [],
    runs: { totalRuns: 0, latestRunId: null, latestRunAt: null, modelsUsed: [] },
  };
}

function richDossier(): DocumentLineageDossier {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-08-03T00:00:00.000Z',
    ledger: ledger(),
    threadId: 'thread_xyz',
    versionHistory: [
      { version: 1, contentHash: 'h1', changeDescription: 'Initial draft by AnA', contentLength: 1200, createdById: null, createdAt: '2026-07-01T00:00:00.000Z', isCurrent: false },
      { version: 3, contentHash: 'h3', changeDescription: 'Human edit', contentLength: 1500, createdById: 3, createdAt: '2026-08-01T00:00:00.000Z', isCurrent: true },
    ],
    decisions: [
      {
        id: 'dec_1', contextType: 'authoring', contextDescription: null, recommendationType: null,
        recommendationSummary: 'Ground M2.5 claims in the CSR', confidence: 'provisional',
        actionState: 'executed', approvalState: 'approved', governanceBoundary: 'advisory',
        authoredBy: 'ana', decidedBy: 'human', createdById: null, approvedById: 3, approvedAt: '2026-08-01T00:00:00.000Z',
        rejectedById: null, rejectedAt: null, rejectionReason: null,
        relatedArtifactVersionId: 1, executedArtifactVersionId: 3, evidenceSources: ['PMID:1'],
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ],
    decisionSummary: { total: 1, anaAuthored: 1, humanAuthored: 0, humanDecided: 1, approved: 1, rejected: 0, pending: 0 },
    provenanceEvents: [
      { eventId: 'ev_1', eventType: 'generation', eventAction: 'ai_generate', actorId: null, actorName: 'AnA', actorEmail: null, artifactVersionId: 1, sourceDescription: 'from evidence corpus', backendService: 'ana-ri-stream', details: { model: 'claude' }, createdAt: '2026-07-01T00:00:00.000Z' },
    ],
    reasoning: [
      { turn: 1, reasoning: 'I should ground claims in the CSR and IB.', model: 'anthropic/claude', createdAt: '2026-07-01T00:00:00.000Z' },
    ],
    humanControls: [
      { turn: 1, action: 'interject', message: 'Focus on the pediatric subgroup', round: 2, at: '2026-07-01T00:01:00.000Z' },
    ],
    dataLineage: [
      { sourceObjectType: 'external_evidence', sourceObjectId: 'PMID:12345', sourceTitle: 'Efficacy of X', sourceContentHash: 'srch', targetObjectType: 'artifact', targetObjectId: 'artifact_abc', linkageType: 'cited_by', transformationType: 'ai_generation', confidenceScore: 88, aiModelUsed: 'anthropic/claude', createdAt: '2026-07-01T00:00:00.000Z' },
    ],
  };
}

function thinDossier(): DocumentLineageDossier {
  return {
    ...richDossier(),
    decisions: [],
    decisionSummary: { total: 0, anaAuthored: 0, humanAuthored: 0, humanDecided: 0, approved: 0, rejected: 0, pending: 0 },
    provenanceEvents: [],
    reasoning: [],
    humanControls: [],
    dataLineage: [],
  };
}

const META = { reportTypeId: 'provenance.evidence_trace_report', reportTypeLabel: 'Evidence & Provenance Trace Report', status: 'partial' as const };

describe('computeLineageConfidence', () => {
  it('a richly-linked document clears the finalize gate (>= 70)', () => {
    expect(computeLineageConfidence(richDossier())).toBeGreaterThanOrEqual(70);
  });

  it('a thin document (iterations only) stays a viewable partial (< 70)', () => {
    const c = computeLineageConfidence(thinDossier());
    expect(c).toBeLessThan(70);
    expect(c).toBeGreaterThanOrEqual(30); // clamped, never fabricates zero-confidence
  });

  it('is clamped to [30, 95]', () => {
    expect(computeLineageConfidence(richDossier())).toBeLessThanOrEqual(95);
  });
});

describe('dossierToRenderedReport', () => {
  const rendered = dossierToRenderedReport(richDossier(), META);

  it('produces a document-scoped RenderedReport for the evidence-trace type', () => {
    expect(rendered.reportTypeId).toBe('provenance.evidence_trace_report');
    expect(rendered.scopeType).toBe('document');
    expect(rendered.scopeId).toBe('artifact_abc');
  });

  it('includes the expected sections', () => {
    const ids = rendered.sections.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'overview', 'iterations', 'decisions', 'data-lineage', 'provenance', 'reasoning', 'disclosure',
      ]),
    );
  });

  it('emits AI-disclosed narrative for AnA reasoning', () => {
    const reasoning = rendered.sections.find((s) => s.id === 'reasoning');
    expect(reasoning?.blocks[0]).toMatchObject({ kind: 'narrative', aiGenerated: true });
    expect(reportIsAiDisclosed(rendered)).toBe(true);
  });

  it('carries provenance atoms on the decision and data-lineage tables', () => {
    const atoms = extractProvenanceAtoms(rendered);
    const tables = new Set(atoms.map((a) => a.sourceTable));
    expect(tables.has('decision_records')).toBe(true);
    expect(tables.has('data_lineage_records')).toBe(true);
    expect(tables.has('concept2cure_artifact_versions')).toBe(true);
  });
});

describe('governed seal integration (the whole point)', () => {
  it('the EXISTING seal captures real provenance atoms — not the empty set', () => {
    const rendered = dossierToRenderedReport(richDossier(), META);
    const seal = buildSealedRecord(rendered, '2026-08-03T00:00:00.000Z');
    expect(seal.atomCount).toBeGreaterThan(0);
    expect(seal.aiDisclosed).toBe(true);
    expect(seal.algorithm).toBe('sha256');
    expect(seal.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Each atom is tagged with its block location (sectionId#blockIndex).
    expect(seal.atoms.every((a) => typeof a.blockPath === 'string' && a.blockPath.includes('#'))).toBe(true);
  });
});
