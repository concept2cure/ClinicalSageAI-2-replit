/**
 * A provenance record persists no confidence figure nobody measured, and no
 * 'validation_based' basis that nothing validated.
 *
 * Until 2026-10-15 toLineageSource turned a record's confidence LEVEL into a
 * 0-100 figure through a lookup table (high 90, moderate 60, low 30), and the
 * registry gave the project RAG corpus — and PubMed, openFDA and every other
 * source a tool assigns a fixed level — confidenceBasis 'validation_based'
 * ("validation engine finding"). A RAG passage with retrieval relevance 0.81
 * was written to data_lineage_records as confidence_score = 90 with
 * confidence_basis = 'validation_based': counted "strong" by the lineage
 * summary (>= 75) and printed as confidenceScore="90" in the lineage dossier.
 * Nothing was validated, and 90 was a table constant.
 *
 * Now the column records no figure (null: not measured), the level is kept as
 * a level (metadata.confidenceLevel), a retrieval score a tool supplies is kept
 * under its own name (metadata.retrievalScore), and the basis says what the
 * level is: 'ai_inferred' for a relevance bucket, 'rules_based' for a level a
 * tool fixes.
 */
import { describe, expect, it } from 'vitest';
import {
  buildProvenance,
  confidenceFromScore,
  EVIDENCE_SOURCES,
  toLineageSource,
} from '../provenance';
import { provenanceToLineageEntry, type ProvenanceTarget } from '../persist-provenance';

const fixedNow = () => new Date('2026-10-15T00:00:00.000Z');

const target: ProvenanceTarget = {
  organizationId: 7,
  targetObjectType: 'artifact',
  targetObjectId: 'art-1',
};

describe('a RAG passage: relevance is not a validated confidence', () => {
  const rec = buildProvenance({
    sourceId: 'project_corpus',
    citation: { title: 'Protocol (Section 9.1)', identifier: 'doc-42', url: null },
    query: 'primary endpoint',
    confidence: confidenceFromScore(0.81),
    retrievalScore: 0.81,
    now: fixedNow,
  });

  it('records no 0-100 confidence figure for it', () => {
    expect(toLineageSource(rec).confidenceScore, 'a lookup-table constant was recorded as a measured confidence').toBeNull();
    expect(provenanceToLineageEntry(rec, target).confidenceScore).toBeUndefined();
  });

  it("names its basis as AI-inferred, never 'validation_based'", () => {
    expect(rec.confidenceBasis).toBe('ai_inferred');
    expect(provenanceToLineageEntry(rec, target).confidenceBasis).toBe('ai_inferred');
  });

  it('keeps the raw retrieval score and the bucketed level, each under its own name', () => {
    const metadata = provenanceToLineageEntry(rec, target).metadata as Record<string, unknown>;
    expect(metadata.retrievalScore).toBe(0.81);
    expect(metadata.confidenceLevel).toBe('high');
  });
});

describe('a level a tool fixes is kept as a level, not converted to a figure', () => {
  it("PubMed's fixed 'high' persists as a rules-based level with no score", () => {
    const rec = buildProvenance({
      sourceId: 'pubmed',
      citation: { title: 'A study', identifier: 'PMID:123', url: null },
      confidence: 'high',
      now: fixedNow,
    });
    const entry = provenanceToLineageEntry(rec, target);
    expect(entry.confidenceScore).toBeUndefined();
    expect(entry.confidenceBasis).toBe('rules_based');
    expect((entry.metadata as Record<string, unknown>).confidenceLevel).toBe('high');
    expect((entry.metadata as Record<string, unknown>).retrievalScore).toBeNull();
  });

  it('a record with no level records none', () => {
    const rec = buildProvenance({ sourceId: 'chembl', citation: { title: 'B', identifier: 'CHEMBL2', url: null }, now: fixedNow });
    const entry = provenanceToLineageEntry(rec, target);
    expect(entry.confidenceScore).toBeUndefined();
    expect((entry.metadata as Record<string, unknown>).confidenceLevel).toBeNull();
  });
});

describe('the source registry', () => {
  it("claims a 'validation_based' basis for no source — none of them runs a validation", () => {
    const claimed = Object.values(EVIDENCE_SOURCES)
      .filter((s) => s.confidenceBasis === 'validation_based')
      .map((s) => s.id);
    expect(claimed).toEqual([]);
  });
});
