/**
 * Tests for diffProjectCitationSnapshotsPayload — the pure aggregator over
 * two project snapshots. We pass a stubbed `loadRun` so the helper is
 * testable without a database.
 */
import { describe, it, expect } from 'vitest';
import {
  diffProjectCitationSnapshotsPayload,
  type ProjectCitationSnapshot,
  type ProjectCitationSnapshotEntry,
  type CitationRunDetail,
  type SentenceCitation,
  type CitationStatus,
} from '../ana/citation-engine';

function entry(over: Partial<ProjectCitationSnapshotEntry> = {}): ProjectCitationSnapshotEntry {
  return {
    artifactId: 'art-1',
    artifactPk: 1,
    ctdSection: '5.3.5',
    title: 'CSR',
    runId: 'run-A',
    runCreatedAt: '2026-05-01T00:00:00Z',
    totalSentences: 0,
    supportedCount: 0,
    contradictedCount: 0,
    gapCount: 0,
    totalReadinessDelta: 0,
    filingBlocked: false,
    ...over,
  };
}

function snapshot(
  asOf: string,
  artifacts: ProjectCitationSnapshotEntry[]
): ProjectCitationSnapshot {
  return { projectId: 1, organizationId: 1, asOf, artifacts };
}

function sent(hash: string, status: CitationStatus): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: 1,
    text: 't',
    contentHash: hash,
    sources: [],
    status,
    gap: null,
    flags: [],
  };
}

function run(runId: string, citations: SentenceCitation[], totalReadinessDelta = 0): CitationRunDetail {
  return {
    runId,
    artifactId: 'art-1',
    artifactPk: 1,
    ctdSection: '5.3.5',
    artifactContentHash: 'h-' + runId,
    totalSentences: citations.length,
    supportedCount: citations.filter(c => c.status === 'supported').length,
    contradictedCount: citations.filter(c => c.status === 'contradicted').length,
    gapCount: citations.filter(c => c.status === 'gap').length,
    totalReadinessDelta,
    filingBlocked: false,
    createdAt: '2026-05-01T00:00:00Z',
    createdBy: 1,
    metadata: {},
    isCurrent: false,
    citations,
  };
}

describe('citation-engine · diffProjectCitationSnapshotsPayload', () => {
  it('returns zeroed summary for empty project', async () => {
    const result = await diffProjectCitationSnapshotsPayload(
      snapshot('2026-04-01T00:00:00Z', []),
      snapshot('2026-05-01T00:00:00Z', []),
      async () => null
    );
    expect(result.summary.artifactsConsidered).toBe(0);
    expect(result.summary.artifactsChanged).toBe(0);
    expect(result.summary.artifactsCitedFirstTime).toBe(0);
    expect(result.perArtifact).toEqual([]);
    expect(result.summary.totalReadinessDeltaChange).toBe(0);
  });

  it('classifies as cited_first_time when from has no run and to has one', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: null, totalSentences: 0 }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'r1', totalSentences: 5, totalReadinessDelta: -2 }),
    ]);
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async id =>
      id === 'r1' ? run('r1', [sent('h1', 'supported'), sent('h2', 'gap')], -2) : null
    );
    expect(result.summary.artifactsCitedFirstTime).toBe(1);
    expect(result.summary.artifactsChanged).toBe(0);
    expect(result.summary.totalAdded).toBe(2);
    expect(result.perArtifact[0].kind).toBe('cited_first_time');
    expect(result.perArtifact[0].diff).toBeNull();
    expect(result.summary.totalReadinessDeltaChange).toBe(-2);
  });

  it('classifies as unchanged when both snapshots point at the same run', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'r1', totalSentences: 3, totalReadinessDelta: -2 }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'r1', totalSentences: 3, totalReadinessDelta: -2 }),
    ]);
    let loadCount = 0;
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async () => {
      loadCount += 1;
      return null;
    });
    expect(result.summary.artifactsUnchanged).toBe(1);
    expect(result.perArtifact[0].kind).toBe('unchanged');
    expect(result.perArtifact[0].diff).toBeNull();
    // Same-run path should not load any runs.
    expect(loadCount).toBe(0);
  });

  it('produces a per-sentence diff for the changed kind', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'rOld', totalReadinessDelta: -10 }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'rNew', totalReadinessDelta: -2 }),
    ]);
    const oldRun = run('rOld', [sent('h1', 'gap'), sent('h2', 'supported')], -10);
    const newRun = run('rNew', [sent('h1', 'supported'), sent('h2', 'supported')], -2);
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async id =>
      id === 'rOld' ? oldRun : id === 'rNew' ? newRun : null
    );
    expect(result.summary.artifactsChanged).toBe(1);
    expect(result.summary.transitionCounts.gap_to_supported).toBe(1);
    expect(result.summary.totalReadinessDeltaChange).toBe(8); // -2 - (-10) = +8
    expect(result.perArtifact[0].kind).toBe('changed');
    expect(result.perArtifact[0].diff).not.toBeNull();
  });

  it('classifies as lost_citations when from has run but to does not', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'rOld', totalReadinessDelta: -5 }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: null }),
    ]);
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async id =>
      id === 'rOld' ? run('rOld', [sent('h1', 'supported')], -5) : null
    );
    expect(result.summary.artifactsLostCitations).toBe(1);
    expect(result.summary.totalRemoved).toBe(1);
    expect(result.perArtifact[0].kind).toBe('lost_citations');
  });

  it('skips never-cited artifacts (no runs in either snapshot)', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: null }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: null }),
    ]);
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async () => null);
    expect(result.summary.artifactsConsidered).toBe(0);
    expect(result.perArtifact).toEqual([]);
  });

  it('falls back to coarse changed when run details are missing', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'gone', totalReadinessDelta: -10 }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'fresh', totalReadinessDelta: -2 }),
    ]);
    // loadRun returns null for both ids → fallback path
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async () => null);
    expect(result.summary.artifactsChanged).toBe(1);
    expect(result.perArtifact[0].kind).toBe('changed');
    expect(result.perArtifact[0].diff).toBeNull();
    // Even without run details we still capture readinessDeltaChange from
    // the snapshot rollup.
    expect(result.summary.totalReadinessDeltaChange).toBe(8);
  });

  it('aggregates transition counts across multiple changed artifacts', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'r1' }),
      entry({ artifactId: 'b', runId: 'r2' }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      entry({ artifactId: 'a', runId: 'r1b' }),
      entry({ artifactId: 'b', runId: 'r2b' }),
    ]);
    const r1 = run('r1', [sent('a1', 'gap'), sent('a2', 'supported')]);
    const r1b = run('r1b', [sent('a1', 'supported'), sent('a2', 'supported')]);
    const r2 = run('r2', [sent('b1', 'supported')]);
    const r2b = run('r2b', [sent('b1', 'gap')]);
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async id => {
      if (id === 'r1') return r1;
      if (id === 'r1b') return r1b;
      if (id === 'r2') return r2;
      if (id === 'r2b') return r2b;
      return null;
    });
    expect(result.summary.artifactsChanged).toBe(2);
    expect(result.summary.transitionCounts.gap_to_supported).toBe(1);
    expect(result.summary.transitionCounts.supported_to_supported).toBe(1);
    expect(result.summary.transitionCounts.supported_to_gap).toBe(1);
  });

  it('sorts perArtifact by readinessDeltaChange ascending (worst first)', async () => {
    const fromSnap = snapshot('2026-04-01T00:00:00Z', [
      entry({ artifactId: 'good', runId: 'r1', totalReadinessDelta: -10 }),
      entry({ artifactId: 'bad', runId: 'r2', totalReadinessDelta: 0 }),
      entry({ artifactId: 'flat', runId: 'r3', totalReadinessDelta: -2 }),
    ]);
    const toSnap = snapshot('2026-05-01T00:00:00Z', [
      // good improved by +8
      entry({ artifactId: 'good', runId: 'r1b', totalReadinessDelta: -2 }),
      // bad regressed by -10
      entry({ artifactId: 'bad', runId: 'r2b', totalReadinessDelta: -10 }),
      // flat unchanged delta
      entry({ artifactId: 'flat', runId: 'r3b', totalReadinessDelta: -2 }),
    ]);
    const result = await diffProjectCitationSnapshotsPayload(fromSnap, toSnap, async () => null);
    // Order: bad (-10), flat (0), good (+8)
    expect(result.perArtifact.map(a => a.artifactId)).toEqual([
      'bad',
      'flat',
      'good',
    ]);
  });
});
