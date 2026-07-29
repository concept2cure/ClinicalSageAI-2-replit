/**
 * Per-section expectations.
 *
 * "What's expected in this CTD section, and how am I doing against it?"
 *
 * For a given artifact's `ctd_section`, walks every gap rule that applies
 * (exact + prefix matches via getGapRulesForSection) and grades the
 * artifact's coverage of that rule:
 *   - 'covered':  ≥1 sentence matches the rule's keyword patterns AND
 *                 has status='supported'
 *   - 'partial':  ≥1 sentence matches the rule's patterns BUT all
 *                 matching sentences are status='gap' or 'contradicted'
 *   - 'missing':  no sentence in the artifact mentions the rule's
 *                 patterns at all
 *
 * Pure helper takes citations[] + section → Expectation[]; the live entry
 * pulls citations from the DB (tenant-scoped) and surfaces the result.
 *
 * Complements gap-classifier.ts (which says "where are the gaps?") by
 * answering "what AnA expects here" prescriptively, even before the
 * citation engine runs.
 *
 * @module server/services/ana/citation-expectations
 */
import {
  getCitationsForArtifact,
  type SentenceCitation,
} from './citation-engine.js';
import {
  getGapRulesForSection,
  type GapRule,
} from './gap-classifier.js';

export type ExpectationStatus = 'covered' | 'partial' | 'missing';

export interface SectionExpectation {
  rule: GapRule;
  status: ExpectationStatus;
  matchingSentenceCount: number;
  /** First few matched sentences for the UI / inspection. */
  matchingSentences: Array<{
    sentenceIndex: number;
    text: string;
    status: SentenceCitation['status'];
    contentHash: string;
  }>;
  /** Distinct artifacts cited as supporting evidence for this rule. */
  matchingSourceArtifactIds: string[];
}

export interface ArtifactSectionExpectations {
  artifactId: string;
  ctdSection: string | null;
  expectationCount: number;
  coveredCount: number;
  partialCount: number;
  missingCount: number;
  expectations: SectionExpectation[];
}

const MAX_MATCHED_SENTENCES_PER_RULE = 5;

/**
 * Pure: derive expectations for an artifact's section. Returns one
 * SectionExpectation per applicable rule, sorted critical → info, then
 * by status (missing → partial → covered) so reviewers see the worst
 * first.
 */
export function deriveSectionExpectations(
  ctdSection: string | null,
  citations: SentenceCitation[]
): SectionExpectation[] {
  if (!ctdSection) return [];
  const rules = getGapRulesForSection(ctdSection);
  if (rules.length === 0) return [];

  const out: SectionExpectation[] = [];

  for (const rule of rules) {
    const matched: SentenceCitation[] = [];
    for (const c of citations) {
      const text = c.text.toLowerCase();
      const hit = rule.patterns.some(p => text.includes(p));
      if (hit) matched.push(c);
    }

    let status: ExpectationStatus;
    if (matched.length === 0) {
      status = 'missing';
    } else if (matched.some(m => m.status === 'supported')) {
      status = 'covered';
    } else {
      // Has matching sentences but none are supported — gaps and/or
      // contradicted entries only.
      status = 'partial';
    }

    const matchingSourceArtifactIds = Array.from(
      new Set(
        matched.flatMap(m =>
          m.sources.filter(s => s.relationship === 'supports').map(s => s.artifactId)
        )
      )
    );

    out.push({
      rule,
      status,
      matchingSentenceCount: matched.length,
      matchingSentences: matched
        .slice(0, MAX_MATCHED_SENTENCES_PER_RULE)
        .map(m => ({
          sentenceIndex: m.sentenceIndex,
          text: m.text,
          status: m.status,
          contentHash: m.contentHash,
        })),
      matchingSourceArtifactIds,
    });
  }

  const SEVERITY_ORDER: Record<GapRule['severity'], number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };
  const STATUS_ORDER: Record<ExpectationStatus, number> = {
    missing: 0,
    partial: 1,
    covered: 2,
  };
  out.sort((a, b) => {
    const sevDelta =
      SEVERITY_ORDER[a.rule.severity] - SEVERITY_ORDER[b.rule.severity];
    if (sevDelta !== 0) return sevDelta;
    const statusDelta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDelta !== 0) return statusDelta;
    return a.rule.id.localeCompare(b.rule.id);
  });

  return out;
}

/**
 * Live entry: pull citations + ctd_section for the artifact, derive
 * expectations. Tenant-scoped via getCitationsForArtifact. Returns null
 * when the artifact doesn't exist for the caller's org.
 */
export async function getArtifactSectionExpectations(
  artifactId: string,
  organizationId: number
): Promise<ArtifactSectionExpectations | null> {
  const persisted = await getCitationsForArtifact(artifactId, organizationId);
  if (!persisted) return null;
  const expectations = deriveSectionExpectations(
    persisted.ctdSection,
    persisted.citations
  );
  let covered = 0;
  let partial = 0;
  let missing = 0;
  for (const e of expectations) {
    if (e.status === 'covered') covered += 1;
    else if (e.status === 'partial') partial += 1;
    else missing += 1;
  }
  return {
    artifactId: persisted.artifactId,
    ctdSection: persisted.ctdSection,
    expectationCount: expectations.length,
    coveredCount: covered,
    partialCount: partial,
    missingCount: missing,
    expectations,
  };
}
