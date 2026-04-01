import { describe, it, expect } from 'vitest';
import { compileModule3Sections, markStaleSections, canFinalizeExport } from '../cmc-module3-compiler';
import { summarizeSectionDiff } from '../cmc-module3-compiler';
import { createSourceHash } from '../cmc-module3-compiler';
import { detectContradictions, deriveImpactTasks } from '../cmc-impact-contradiction-engine';

describe('CMC Module 3 compiler', () => {
  it('compiles deterministic sections from canonical source objects', () => {
    const compiled = compileModule3Sections([
      { id: '1', sourceType: 'drug_substance', sourcePayload: { name: 'API-X' }, sourceHash: 'h1' },
      { id: '2', sourceType: 'specification', sourcePayload: { assay: '98-102' }, sourceHash: 'h2' },
      { id: '3', sourceType: 'method', sourcePayload: { method: 'HPLC' }, sourceHash: 'h3' },
    ]);

    const s4 = compiled.find((s) => s.sectionKey === '3.2.S.4');
    expect(s4).toBeDefined();
    expect(s4?.deterministicJson.objects.length).toBe(2);
    expect(s4?.lineage.length).toBe(2);
    expect(s4?.compiledHash).toBeTruthy();
  });

  it('marks dependent sections stale on source changes', () => {
    const compiled = compileModule3Sections([
      { id: '2', sourceType: 'specification', sourcePayload: { assay: '98-102' }, sourceHash: 'h2' },
    ]);
    const stale = markStaleSections(compiled, 'specification', 'spec updated');
    expect(stale.some((s) => s.sectionKey === '3.2.S.4' && s.stale)).toBe(true);
    expect(stale.some((s) => s.sectionKey === '3.2.P.5' && s.stale)).toBe(true);
  });

  it('blocks final export for unresolved critical contradictions', () => {
    expect(canFinalizeExport({ approvalState: 'approved', contradictions: [{ severity: 'critical', status: 'open' }] })).toBe(false);
    expect(canFinalizeExport({ approvalState: 'approved', contradictions: [{ severity: 'high', status: 'open' }] })).toBe(true);
  });

  it('produces deterministic hashes for unchanged canonical input', () => {
    const input = [{ id: '1', sourceType: 'drug_substance', sourcePayload: { name: 'API-X' }, sourceHash: 'h1' }];
    const a = compileModule3Sections(input);
    const b = compileModule3Sections(input);
    expect(a.find((x) => x.sectionKey === '3.2.S.1')?.compiledHash).toEqual(
      b.find((x) => x.sectionKey === '3.2.S.1')?.compiledHash
    );
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
