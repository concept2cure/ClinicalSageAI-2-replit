/**
 * Citation regression watchdog.
 *
 * Compares two citation runs for the same artifact and flags real
 * regressions — sentences that USED to be supported but now aren't,
 * net new gaps or contradictions, filing-blocked transitions, and a
 * worse readiness delta.
 *
 * Sentences are matched by contentHash, the same way diffCitationRunsPayload
 * does it, so insertions / deletions don't leak into "regression".
 *
 * The pure helper is exported standalone for tests; the run engine fires
 * a metric event whenever hasRegression=true.
 *
 * @module server/services/ana/citation-regression
 */
import type {
  CitationRunDetail,
  CitationStatus,
  SentenceCitation,
} from './citation-engine.js';

export interface CitationRegression {
  artifactId: string;
  fromRunId: string;
  toRunId: string;

  /** Sentences that transitioned supported → gap. */
  newGaps: number;
  /** Sentences that transitioned supported → contradicted. */
  newContradictions: number;
  /** Sentences that were supported and lost ALL supports (now empty). */
  lostSupports: number;
  /** Sentences that newly trigger a filing-blocking gap. */
  newFilingBlocks: number;
  /** Wasn't filing-blocked at `from`, is at `to`. Per-artifact roll-up. */
  filingBlockedRegression: boolean;
  /** Negative = worse. (toDelta - fromDelta), so a regression is < 0. */
  readinessDeltaRegression: number;
  /** True when any regression metric is non-zero / negative. */
  hasRegression: boolean;
  /** Per-sentence detail for the dashboard / audit log. */
  regressedSentences: Array<{
    contentHash: string;
    text: string;
    fromStatus: CitationStatus;
    toStatus: CitationStatus;
    fromSupportCount: number;
    toSupportCount: number;
    triggers: Array<
      | 'newGap'
      | 'newContradiction'
      | 'lostSupports'
      | 'newFilingBlock'
    >;
  }>;
}

function indexByContentHash(
  citations: SentenceCitation[]
): Map<string, SentenceCitation> {
  const m = new Map<string, SentenceCitation>();
  for (const c of citations) m.set(c.contentHash, c);
  return m;
}

function supportCount(c: SentenceCitation): number {
  return c.sources.filter(s => s.relationship === 'supports').length;
}

/**
 * Pure: detect regressions between two runs of the same artifact. Caller
 * is responsible for verifying both runs belong to the same artifact —
 * the helper just compares the citations[].
 */
export function detectCitationRegression(
  prev: CitationRunDetail,
  curr: CitationRunDetail
): CitationRegression {
  const prevByHash = indexByContentHash(prev.citations);
  const currByHash = indexByContentHash(curr.citations);
  const regressedSentences: CitationRegression['regressedSentences'] = [];
  let newGaps = 0;
  let newContradictions = 0;
  let lostSupports = 0;
  let newFilingBlocks = 0;

  for (const [hash, currCit] of currByHash) {
    const prevCit = prevByHash.get(hash);
    if (!prevCit) continue; // newly-added sentence is not a regression

    const triggers: CitationRegression['regressedSentences'][number]['triggers'] = [];
    const fromSup = supportCount(prevCit);
    const toSup = supportCount(currCit);

    if (prevCit.status === 'supported' && currCit.status === 'gap') {
      newGaps += 1;
      triggers.push('newGap');
    }
    if (prevCit.status === 'supported' && currCit.status === 'contradicted') {
      newContradictions += 1;
      triggers.push('newContradiction');
    }
    if (fromSup > 0 && toSup === 0 && prevCit.status === 'supported') {
      lostSupports += 1;
      triggers.push('lostSupports');
    }
    const wasBlocking = !!prevCit.gap?.blockingFiling;
    const isBlocking = !!currCit.gap?.blockingFiling;
    if (!wasBlocking && isBlocking) {
      newFilingBlocks += 1;
      triggers.push('newFilingBlock');
    }

    if (triggers.length > 0) {
      regressedSentences.push({
        contentHash: hash,
        text: currCit.text,
        fromStatus: prevCit.status,
        toStatus: currCit.status,
        fromSupportCount: fromSup,
        toSupportCount: toSup,
        triggers,
      });
    }
  }

  // Filing-blocked transitions at the artifact-roll-up level.
  const filingBlockedRegression =
    !prev.filingBlocked && curr.filingBlocked;
  // readinessDeltaRegression: NEGATIVE means worse. (current - prev) where
  // both are negative numbers; a more-negative current means a regression.
  const readinessDeltaRegression =
    curr.totalReadinessDelta - prev.totalReadinessDelta;

  const hasRegression =
    newGaps > 0 ||
    newContradictions > 0 ||
    lostSupports > 0 ||
    newFilingBlocks > 0 ||
    filingBlockedRegression ||
    readinessDeltaRegression < 0;

  return {
    artifactId: curr.artifactId,
    fromRunId: prev.runId,
    toRunId: curr.runId,
    newGaps,
    newContradictions,
    lostSupports,
    newFilingBlocks,
    filingBlockedRegression,
    readinessDeltaRegression,
    hasRegression,
    regressedSentences,
  };
}
