/**
 * Document Lineage & Decision Dossier — pure derivation + XML serialization.
 *
 * Covers the DB-free surface: actor derivation (AnA vs human), the decision
 * rollup, and the dossier XML serializer (well-formedness, escaping, nested
 * AnALedger, and every convergence section). The DB assembler is exercised
 * separately; these guard the logic a reviewer relies on being correct.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveDecisionActors,
  summarizeDecisions,
  DOSSIER_SCHEMA_VERSION,
  type DocumentLineageDossier,
  type DossierDecision,
} from '../lineage-dossier.js';
import {
  serializeDocumentLineageDossierXml,
  DOSSIER_NAMESPACE,
} from '../lineage-dossier-xml.js';
import type { ArtifactLedger } from '../../export/docx-ledger-collector.js';

describe('deriveDecisionActors', () => {
  it('treats a null created_by_id as AnA-authored', () => {
    const { authoredBy, decidedBy } = deriveDecisionActors({
      created_by_id: null,
      approved_by_id: null,
      rejected_by_id: null,
    });
    expect(authoredBy).toBe('ana');
    expect(decidedBy).toBeNull();
  });

  it('treats a present human created_by_id as human-authored', () => {
    const { authoredBy } = deriveDecisionActors({
      created_by_id: 42,
      approved_by_id: null,
      rejected_by_id: null,
    });
    expect(authoredBy).toBe('human');
  });

  it('honours an explicit provenance.createdByType over the FK heuristic', () => {
    const { authoredBy } = deriveDecisionActors({
      created_by_id: 42, // would otherwise read as human
      approved_by_id: null,
      rejected_by_id: null,
      provenance: { createdByType: 'ana' },
    });
    expect(authoredBy).toBe('ana');
  });

  it('marks a decision resolved by a human when approved or rejected', () => {
    expect(
      deriveDecisionActors({ created_by_id: null, approved_by_id: 7, rejected_by_id: null })
        .decidedBy,
    ).toBe('human');
    expect(
      deriveDecisionActors({ created_by_id: null, approved_by_id: null, rejected_by_id: 9 })
        .decidedBy,
    ).toBe('human');
  });
});

function decision(partial: Partial<DossierDecision>): DossierDecision {
  return {
    id: 'dec_1',
    contextType: 'authoring',
    contextDescription: null,
    recommendationType: null,
    recommendationSummary: 'Do the thing',
    confidence: 'provisional',
    actionState: 'recommended_only',
    approvalState: null,
    governanceBoundary: null,
    authoredBy: 'ana',
    decidedBy: null,
    createdById: null,
    approvedById: null,
    approvedAt: null,
    rejectedById: null,
    rejectedAt: null,
    rejectionReason: null,
    relatedArtifactVersionId: null,
    executedArtifactVersionId: null,
    evidenceSources: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('summarizeDecisions', () => {
  it('rolls up authored/decided/approved/rejected/pending counts', () => {
    const summary = summarizeDecisions([
      decision({ id: 'a', authoredBy: 'ana', decidedBy: 'human', approvedById: 1 }),
      decision({ id: 'b', authoredBy: 'ana', decidedBy: 'human', rejectedById: 2 }),
      decision({ id: 'c', authoredBy: 'human', decidedBy: null }),
    ]);
    expect(summary).toEqual({
      total: 3,
      anaAuthored: 2,
      humanAuthored: 1,
      humanDecided: 2,
      approved: 1,
      rejected: 1,
      pending: 1,
    });
  });
});

function minimalLedger(): ArtifactLedger {
  return {
    schemaVersion: '1.0',
    generatedAt: '2026-08-03T00:00:00.000Z',
    artifact: {
      artifactId: 'artifact_abc',
      artifactPk: 1,
      organizationId: 10,
      projectId: 5,
      title: 'Clinical Overview <M2.5>',
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

function fixtureDossier(): DocumentLineageDossier {
  const decisions = [
    decision({ id: 'dec_ana', authoredBy: 'ana', decidedBy: 'human', approvedById: 3 }),
  ];
  return {
    schemaVersion: DOSSIER_SCHEMA_VERSION,
    generatedAt: '2026-08-03T00:00:00.000Z',
    ledger: minimalLedger(),
    threadId: 'thread_xyz',
    versionHistory: [
      {
        version: 1,
        contentHash: 'hash1',
        changeDescription: 'Initial draft by AnA',
        contentLength: 1200,
        createdById: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        isCurrent: false,
      },
      {
        version: 3,
        contentHash: 'hash3',
        changeDescription: 'Human edit & approval',
        contentLength: 1500,
        createdById: 3,
        createdAt: '2026-08-01T00:00:00.000Z',
        isCurrent: true,
      },
    ],
    decisions,
    decisionSummary: summarizeDecisions(decisions),
    provenanceEvents: [
      {
        eventId: 'ev_1',
        eventType: 'generation',
        eventAction: 'ai_generate',
        actorId: null,
        actorName: 'AnA',
        actorEmail: null,
        artifactVersionId: 1,
        sourceDescription: 'Generated from evidence corpus',
        backendService: 'ana-ri-stream',
        details: { model: 'claude', tokens: 900 },
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    reasoning: [
      {
        turn: 1,
        reasoning: 'The user asked for M2.5 — I should ground claims in the CSR & IB.',
        model: 'anthropic/claude',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    humanControls: [
      {
        turn: 1,
        action: 'interject',
        message: 'Focus on the pediatric subgroup',
        round: 2,
        at: '2026-07-01T00:01:00.000Z',
      },
    ],
    dataLineage: [
      {
        sourceObjectType: 'external_evidence',
        sourceObjectId: 'PMID:12345',
        sourceTitle: 'Efficacy of X in Y',
        sourceContentHash: 'srchash',
        targetObjectType: 'artifact',
        targetObjectId: 'artifact_abc',
        linkageType: 'cited_by',
        transformationType: 'ai_generation',
        confidenceScore: 88,
        aiModelUsed: 'anthropic/claude',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ],
  };
}

describe('serializeDocumentLineageDossierXml', () => {
  const xml = serializeDocumentLineageDossierXml(fixtureDossier());

  it('emits a well-formed dossier root in the dossier namespace', () => {
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect(xml).toContain(`<DocumentLineageDossier xmlns="${DOSSIER_NAMESPACE}"`);
    expect(xml.trimEnd().endsWith('</DocumentLineageDossier>')).toBe(true);
    expect(xml).toContain('threadId="thread_xyz"');
  });

  it('nests the AnALedger base without a duplicate XML prolog', () => {
    // Exactly one prolog (the dossier's own); the embedded ledger's is stripped.
    expect(xml.match(/<\?xml/g)?.length).toBe(1);
    expect(xml).toContain('<AnALedger');
    expect(xml).toContain('artifact_abc');
  });

  it('escapes special characters in text content', () => {
    // The artifact title contains < and > — must be escaped, never raw.
    expect(xml).toContain('Clinical Overview &lt;M2.5&gt;');
    expect(xml).not.toContain('Clinical Overview <M2.5>');
  });

  it('renders the version history with a current-version flag', () => {
    expect(xml).toContain('<VersionHistory count="2">');
    expect(xml).toContain('isCurrent="true"');
    expect(xml).toContain('Human edit &amp; approval');
  });

  it('renders decisions with the AnA-vs-human rollup', () => {
    expect(xml).toContain('anaAuthored="1"');
    expect(xml).toContain('humanDecided="1"');
    expect(xml).toContain('approved="1"');
    expect(xml).toContain('authoredBy="ana"');
    expect(xml).toContain('decidedBy="human"');
  });

  it('renders provenance, reasoning, and data-lineage sections', () => {
    expect(xml).toContain('<ProvenanceEvents count="1">');
    expect(xml).toContain('eventAction="ai_generate"');
    expect(xml).toContain('<Reasoning count="1">');
    expect(xml).toContain('ground claims in the CSR');
    expect(xml).toContain('<DataLineage count="1">');
    expect(xml).toContain('linkageType="cited_by"');
  });

  it('renders human control actions (pause/interject/redirect/cancel)', () => {
    expect(xml).toContain('<HumanControls count="1">');
    expect(xml).toContain('action="interject"');
    expect(xml).toContain('Focus on the pediatric subgroup');
  });

  it('CDATA-wraps JSON detail payloads', () => {
    expect(xml).toContain('<![CDATA[');
    expect(xml).toContain('"tokens":900');
  });
});
