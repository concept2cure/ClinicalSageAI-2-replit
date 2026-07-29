/**
 * Translation Memory — deterministic unit tests. Pure, no DB/LLM/clock.
 *
 * Proves: exact-match reuse, that stored *approved* segments are returned on
 * later lookups, tenant + language-pair isolation, fuzzy thresholding, identifier-
 * preserving normalization, and the regulated guardrail that machine drafts are
 * never TM-eligible.
 */

import { describe, it, expect } from 'vitest';

import type { SegmentProvenance, TranslationSegment } from '../types';
import type { TmEntry } from '../translation-memory';
import {
  InMemoryTranslationMemory,
  createInMemoryTranslationMemory,
  fromSegment,
  hashSource,
  levenshtein,
  normalizeForMatch,
  similarity,
} from '../translation-memory';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const provenance: SegmentProvenance = {
  sourceHash: hashSource('Administer 10 mg of the study drug per 21 CFR 312.'),
  engine: 'gateway-mt',
  promptVersion: 'v1',
  postEditedBy: 7,
  postEditedAt: '2026-06-01T00:00:00.000Z',
  reviewedBy: 9,
  reviewedAt: '2026-06-02T00:00:00.000Z',
  approvedBy: 9,
  approvedAt: '2026-06-02T00:00:00.000Z',
  backTranslation: {
    targetLang: 'de',
    backText: 'Administer 10 mg of the study drug per 21 CFR 312.',
    engine: 'gateway-mt',
    similarity: 0.97,
    verified: true,
    performedAt: '2026-06-02T00:00:00.000Z',
  },
};

function entry(overrides: Partial<TmEntry> = {}): TmEntry {
  const sourceText = overrides.sourceText ?? 'Administer 10 mg of the study drug per 21 CFR 312.';
  return {
    organizationId: 1,
    sourceLang: 'en',
    targetLang: 'de',
    sourceText,
    targetText: '10 mg des Studienmedikaments gemäß 21 CFR 312 verabreichen.',
    sourceHash: hashSource(sourceText),
    method: 'mt_postedited',
    provenance,
    ...overrides,
  };
}

// ── Normalization & similarity ───────────────────────────────────────────────

describe('normalizeForMatch', () => {
  it('folds case and collapses whitespace, idempotently', () => {
    expect(normalizeForMatch('  Hello\tWorld\n')).toBe('hello world');
    const once = normalizeForMatch('Foo   Bar');
    expect(normalizeForMatch(once)).toBe(once);
  });
});

describe('levenshtein / similarity', () => {
  it('distance and normalized similarity are deterministic', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('the cat sat', 'the cat sat.')).toBeGreaterThan(0.9);
    expect(similarity('totally different', 'xxxxxxxxxxxxxxxxx')).toBeLessThan(0.2);
  });
});

// ── Exact-match reuse ────────────────────────────────────────────────────────

describe('InMemoryTranslationMemory — exact-match reuse', () => {
  it('returns an exact hit (score 1.0) for a stored source', () => {
    const tm = new InMemoryTranslationMemory();
    const e = entry();
    tm.store(e);

    const hits = tm.lookup({
      organizationId: e.organizationId,
      sourceLang: e.sourceLang,
      targetLang: e.targetLang,
      sourceText: e.sourceText,
      sourceHash: e.sourceHash,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      targetText: e.targetText,
      score: 1,
      matchKind: 'exact',
      method: 'mt_postedited',
    });
  });

  it('finds the exact hit even when the caller did not pre-hash', () => {
    const tm = new InMemoryTranslationMemory();
    const e = entry();
    tm.store(e);

    const hits = tm.lookup({
      organizationId: e.organizationId,
      sourceLang: e.sourceLang,
      targetLang: e.targetLang,
      sourceText: e.sourceText,
      sourceHash: '', // intentionally absent
    });
    expect(hits[0]?.score).toBe(1);
  });

  it('treats whitespace/case-only differences as exact-meaning reuse', () => {
    const tm = new InMemoryTranslationMemory();
    const e = entry();
    tm.store(e);

    const cosmetic = `  ${e.sourceText.toUpperCase()}  `;
    const hits = tm.lookup({
      organizationId: e.organizationId,
      sourceLang: e.sourceLang,
      targetLang: e.targetLang,
      sourceText: cosmetic,
      sourceHash: hashSource(cosmetic),
    });
    expect(hits[0]).toMatchObject({ score: 1, matchKind: 'exact', targetText: e.targetText });
  });
});

// ── Stored approved segments reused on subsequent lookups ─────────────────────

describe('store() then lookup() — approved segments are reused', () => {
  it('returns a stored post-edited segment on a later lookup', () => {
    const tm = createInMemoryTranslationMemory();
    expect(tm.size()).toBe(0);

    const segment: TranslationSegment = {
      id: 42,
      projectId: 3,
      organizationId: 1,
      ordinal: 0,
      sourceText: 'Report any serious adverse event to the sponsor within 24 hours.',
      targetText: 'Schwerwiegende unerwünschte Ereignisse innerhalb von 24 Stunden dem Sponsor melden.',
      sourceHash: hashSource('Report any serious adverse event to the sponsor within 24 hours.'),
      sourceLang: 'en',
      targetLang: 'de',
      method: 'mt_postedited',
      status: 'approved',
      provenance,
    };

    tm.store(fromSegment(segment));
    expect(tm.size()).toBe(1);

    const hits = tm.lookup({
      organizationId: 1,
      sourceLang: 'en',
      targetLang: 'de',
      sourceText: segment.sourceText,
      sourceHash: segment.sourceHash,
    });
    expect(hits[0]).toMatchObject({
      targetText: segment.targetText,
      method: 'mt_postedited',
      score: 1,
    });
    // Provenance is carried through for the Part-11 audit trail.
    expect(hits[0].provenance.approvedBy).toBe(9);
  });

  it('upserts: the latest approved translation for the same source wins', () => {
    const tm = new InMemoryTranslationMemory();
    tm.store(entry({ targetText: 'erste Fassung' }));
    tm.store(entry({ targetText: 'überarbeitete Fassung' }));

    expect(tm.size()).toBe(1); // dedup on normalized source within scope
    const e = entry();
    const hits = tm.lookup({
      organizationId: e.organizationId,
      sourceLang: e.sourceLang,
      targetLang: e.targetLang,
      sourceText: e.sourceText,
      sourceHash: e.sourceHash,
    });
    expect(hits[0].targetText).toBe('überarbeitete Fassung');
  });
});

// ── Fuzzy matching ───────────────────────────────────────────────────────────

describe('fuzzy lookup', () => {
  it('returns a fuzzy match above threshold and none below', () => {
    const tm = new InMemoryTranslationMemory();
    const e = entry({ sourceText: 'Administer 10 mg of the study drug to the subject.' });
    tm.store(e);

    const near = tm.lookup(
      {
        organizationId: 1,
        sourceLang: 'en',
        targetLang: 'de',
        sourceText: 'Administer 10 mg of the study drug to the patient.',
        sourceHash: hashSource('Administer 10 mg of the study drug to the patient.'),
      },
      { threshold: 0.8 },
    );
    expect(near).toHaveLength(1);
    expect(near[0].matchKind).toBe('fuzzy');
    expect(near[0].score).toBeGreaterThanOrEqual(0.8);
    expect(near[0].score).toBeLessThan(1);

    const far = tm.lookup(
      {
        organizationId: 1,
        sourceLang: 'en',
        targetLang: 'de',
        sourceText: 'The investigator must obtain informed consent before enrollment.',
        sourceHash: hashSource('The investigator must obtain informed consent before enrollment.'),
      },
      { threshold: 0.8 },
    );
    expect(far).toHaveLength(0);
  });

  it('returns best-first up to the requested limit', () => {
    const tm = new InMemoryTranslationMemory();
    tm.store(entry({ sourceText: 'The dose is 10 mg daily.', targetText: 'A' }));
    tm.store(entry({ sourceText: 'The dose is 10 mg twice daily.', targetText: 'B' }));

    const hits = tm.lookup(
      {
        organizationId: 1,
        sourceLang: 'en',
        targetLang: 'de',
        sourceText: 'The dose is 10 mg once daily.',
        sourceHash: hashSource('The dose is 10 mg once daily.'),
      },
      { threshold: 0.5, limit: 2 },
    );
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });
});

// ── Isolation ────────────────────────────────────────────────────────────────

describe('tenant + language-pair isolation', () => {
  it('never returns matches across organizations or language pairs', () => {
    const tm = new InMemoryTranslationMemory();
    const e = entry();
    tm.store(e);

    const otherOrg = tm.lookup({
      organizationId: 999,
      sourceLang: e.sourceLang,
      targetLang: e.targetLang,
      sourceText: e.sourceText,
      sourceHash: e.sourceHash,
    });
    expect(otherOrg).toEqual([]);

    const otherLang = tm.lookup({
      organizationId: e.organizationId,
      sourceLang: e.sourceLang,
      targetLang: 'fr',
      sourceText: e.sourceText,
      sourceHash: e.sourceHash,
    });
    expect(otherLang).toEqual([]);
  });
});

// ── Regulated guardrail: machine drafts are never TM-eligible ─────────────────

describe('guardrail — machine drafts are never stored', () => {
  it('store() rejects a machine-method entry', () => {
    const tm = new InMemoryTranslationMemory();
    expect(() => tm.store(entry({ method: 'machine' as never }))).toThrow(/non-approvable/);
    expect(tm.size()).toBe(0);
  });

  it('fromSegment() rejects a machine draft segment', () => {
    const draft: TranslationSegment = {
      id: 1,
      projectId: 1,
      organizationId: 1,
      ordinal: 0,
      sourceText: 'x',
      targetText: 'y',
      sourceHash: hashSource('x'),
      sourceLang: 'en',
      targetLang: 'de',
      method: 'machine',
      status: 'mt_draft',
      provenance,
    };
    expect(() => fromSegment(draft)).toThrow(/non-approvable method 'machine'/);
  });
});
