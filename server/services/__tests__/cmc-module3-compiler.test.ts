import { describe, it, expect } from 'vitest';
import { canFinalizeExport } from '../cmc-module3-compiler';
import { summarizeSectionDiff } from '../cmc-module3-compiler';
import { createSourceHash } from '../cmc-module3-compiler';
import { detectContradictions, deriveImpactTasks } from '../cmc-impact-contradiction-engine';

describe('CMC Module 3 compiler', () => {
  // The compile and stale cases went with compileModule3Sections and
  // markStaleSections (R1 S29, 2026-11-09). The composer is pinned by
  // module3Composer.test.ts; staleness by impactedSectionsForSourceType.
  it('blocks final export for unresolved critical contradictions', () => {
    expect(canFinalizeExport({ approvalState: 'approved', contradictions: [{ severity: 'critical', status: 'open' }] })).toBe(false);
    expect(canFinalizeExport({ approvalState: 'approved', contradictions: [{ severity: 'high', status: 'open' }] })).toBe(true);
  });
});

describe('CMC contradiction engine', () => {
  it('detects critical contradictions and derives impact tasks', () => {
    const contradictions = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'rejected' }],
      comparability: [{ assessmentName: 'Site transfer', regulatoryRiskLevel: 'critical' }],
    });
    expect(contradictions.length).toBeGreaterThanOrEqual(2);

    const tasks = deriveImpactTasks(contradictions);
    expect(tasks.some((t) => t.priority === 'P0')).toBe(true);
    expect(tasks[0].impactedSections.length).toBeGreaterThan(0);
  });

  it('builds provenance-friendly diff summaries', () => {
    const diff = summarizeSectionDiff({ a: 1, b: { x: 1 } }, { a: 2, c: true });
    expect(diff.addedTopLevelKeys).toContain('c');
    expect(diff.removedTopLevelKeys).toContain('b');
    expect(diff.changedTopLevelKeys).toContain('a');
  });

  it('creates stable source hashes for equivalent payloads', () => {
    const a = createSourceHash({ assay: '98-102', limits: { min: 98, max: 102 } });
    const b = createSourceHash({ assay: '98-102', limits: { min: 98, max: 102 } });
    expect(a).toEqual(b);
  });

  it('creates stable hashes across different key ordering', () => {
    const a = createSourceHash({ b: 2, a: 1, nested: { z: true, x: false } });
    const b = createSourceHash({ a: 1, nested: { x: false, z: true }, b: 2 });
    expect(a).toEqual(b);
  });
});
