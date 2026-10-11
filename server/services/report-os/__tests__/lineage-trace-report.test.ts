/**
 * Lineage → Report-OS adapter: confidence + dossier→RenderedReport mapping,
 * proven end-to-end against the REAL seal so we know the governed pipeline
 * captures the dossier's provenance atoms (the whole point of the integration).
 */
import { describe, it, expect } from 'vitest';
import {
  dossierToRenderedReport,
  lineageTraceConfidence,
} from '../lineage-trace-report.js';
import { measureProvenanceCompleteness } from '../../ana/lineage-dossier.js';
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
    auditLogUnavailable: null,
    signatures: [],
    signaturesUnavailable: null,
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
    decisionSummary: { unavailable: null, total: 1, anaAuthored: 1, humanAuthored: 0, humanDecided: 1, approved: 1, rejected: 0, pending: 0 },
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
      { sourceObjectType: 'external_evidence', sourceObjectId: 'PMID:12345', sourceTitle: 'Efficacy of X', sourceContentHash: 'srch', targetObjectType: 'artifact', targetObjectId: 'artifact_abc', linkageType: 'cited_by', transformationType: 'ai_generation', confidenceScore: 88, confidenceBasis: 'retrieval_relevance', aiModelUsed: 'anthropic/claude', createdAt: '2026-07-01T00:00:00.000Z' },
    ],
  };
}

function thinDossier(): DocumentLineageDossier {
  return {
    ...richDossier(),
    decisions: [],
    decisionSummary: { unavailable: null, total: 0, anaAuthored: 0, humanAuthored: 0, humanDecided: 0, approved: 0, rejected: 0, pending: 0 },
    provenanceEvents: [],
    reasoning: [],
    humanControls: [],
    dataLineage: [],
  };
}

const META = { reportTypeId: 'provenance.evidence_trace_report', reportTypeLabel: 'Evidence & Provenance Trace Report', status: 'partial' as const };

/* P-26 (docs/LAUNCH_DEFINITION_OF_DONE.md): "Confidence is a measured figure
   or nothing." The trace's confidence was computeLineageConfidence — 30, plus
   25 for a version, 15 for a decision, 10 for a provenance event, 10 for a
   lineage row or citations, 5 for a signature, clamped to 30–95: a count of
   which records exist, which an ordinary document cleared at 75 with nothing
   traced (reporting review 2026-10-01, PROVENANCE-5). It is now the lineage
   engine's measured provenance completeness: the share of the document's
   current text whose origin the span lineage records
   (summarizeDocumentAttribution, the figure Authoring's attribution bar shows). */
const completeness = (contentLength: number, attributed: number) =>
  measureProvenanceCompleteness({
    contentLength,
    attributedChars: attributed,
    unattributedChars: contentLength - attributed,
    byKind: { fromSources: attributed, authorAsserted: 0, machineDrafted: 0, machineDraftedUnaccepted: 0 },
    staleChars: 0,
  });

describe('measureProvenanceCompleteness — the share of the text with a recorded origin', () => {
  it('is attributed characters over the text, as a whole percent', () => {
    expect(completeness(1000, 1000).percent).toBe(100);
    expect(completeness(1000, 0).percent).toBe(0);
    expect(completeness(200, 90).percent).toBe(45);
  });

  it('is floored, so a document is never rounded up past the finalize threshold', () => {
    expect(completeness(1000, 699).percent).toBe(69);
    expect(completeness(3, 2).percent).toBe(66);
  });

  it('a document with no text is not measured: null, never 0 or 100', () => {
    expect(completeness(0, 0).percent).toBeNull();
  });

  it('carries the partition it was measured from', () => {
    const c = completeness(200, 150);
    expect(c).toMatchObject({ contentLength: 200, attributedChars: 150, unattributedChars: 50, staleChars: 0 });
    expect(c.byKind.fromSources).toBe(150);
  });
});

describe('lineageTraceConfidence — the measure, not a count of the records present', () => {
  it('is the dossier\'s measured provenance completeness', () => {
    expect(lineageTraceConfidence({ ...richDossier(), provenanceCompleteness: completeness(1000, 640) })).toBe(64);
  });

  it('a record-rich document with little traced text is not raised by its records', () => {
    // Versions, an executed decision, a provenance event, a lineage row: 85 under the old count.
    expect(lineageTraceConfidence({ ...richDossier(), provenanceCompleteness: completeness(1000, 400) })).toBe(40);
  });

  it('a thin document whose every character has a recorded origin is 100', () => {
    expect(lineageTraceConfidence({ ...thinDossier(), provenanceCompleteness: completeness(500, 500) })).toBe(100);
  });

  it('is null — nothing — when the completeness was not measured', () => {
    expect(lineageTraceConfidence({ ...richDossier(), provenanceCompleteness: null })).toBeNull();
    expect(lineageTraceConfidence(richDossier())).toBeNull();
    expect(lineageTraceConfidence({ ...richDossier(), provenanceCompleteness: completeness(0, 0) })).toBeNull();
  });

  it('is null when the decision record could not be read: the trace is not measured in full', () => {
    const d = richDossier();
    expect(lineageTraceConfidence({
      ...d,
      provenanceCompleteness: completeness(1000, 1000),
      decisionSummary: { ...d.decisionSummary, unavailable: 'read failed' },
    })).toBeNull();
  });
});

describe('the rendered trace states its provenance completeness and what it was measured from', () => {
  const section = (d: DocumentLineageDossier) =>
    dossierToRenderedReport(d, META).sections.find((x) => x.id === 'provenance-completeness');

  it('prints the figure, the characters behind it and their partition, linked to the span lineage', () => {
    const s = section({ ...richDossier(), provenanceCompleteness: completeness(1000, 640) })!;
    expect(s).toBeTruthy();
    const metrics = s.blocks.filter((b) => b.kind === 'metric') as Array<{ label: string; value: unknown; provenance?: Array<{ sourceTable: string }> }>;
    const byLabel = Object.fromEntries(metrics.map((m) => [m.label, m.value]));
    expect(byLabel['Provenance completeness']).toBe('64%');
    expect(byLabel['Characters with a recorded origin']).toBe('640 of 1000');
    expect(byLabel['No recorded origin']).toBe(360);
    expect(metrics.find((m) => m.label === 'Provenance completeness')!.provenance?.[0]?.sourceTable).toBe('document_span_lineage');
  });

  it('says it was not measured rather than printing a number', () => {
    const s = section({ ...richDossier(), provenanceCompleteness: null })!;
    const metric = s.blocks.find((b) => b.kind === 'metric') as { label: string; value: unknown };
    expect(metric.label).toBe('Provenance completeness');
    expect(String(metric.value)).toMatch(/^not measured/);
  });

  it('lists the untraced text as a gap', () => {
    const gaps = dossierToRenderedReport({ ...richDossier(), provenanceCompleteness: completeness(1000, 640) }, META)
      .sections.find((x) => x.id === 'gaps')!.blocks[0] as { items: Array<{ title: string }> };
    expect(gaps.items.map((i) => i.title)).toContain('360 of 1000 characters have no recorded origin');
  });
});

describe('the data-lineage table names what its figure is', () => {
  const lineageTable = (d: DocumentLineageDossier) =>
    dossierToRenderedReport(d, META).sections.find((x) => x.id === 'data-lineage')!.blocks[0] as { columns: string[]; rows: unknown[][] };

  it('prints the recorded confidence beside its basis, never a bare "Confidence"', () => {
    const t = lineageTable(richDossier());
    expect(t.columns).toContain('Recorded confidence');
    expect(t.columns).toContain('Confidence basis');
    expect(t.columns).not.toContain('Confidence');
    expect(t.rows[0][t.columns.indexOf('Confidence basis')]).toBe('retrieval_relevance');
  });

  it('says the basis was not recorded when the writer recorded none', () => {
    const d = richDossier();
    const t = lineageTable({ ...d, dataLineage: [{ ...d.dataLineage[0], confidenceBasis: null }] });
    expect(t.rows[0][t.columns.indexOf('Confidence basis')]).toBe('not recorded');
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
