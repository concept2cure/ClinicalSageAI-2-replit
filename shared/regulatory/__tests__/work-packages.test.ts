/**
 * compileWorkPackages — the deterministic regulatory work-package compiler
 * (MDX-PM-02).
 *
 * These tests hold the three properties the compiler exists to guarantee:
 *   1. Determinism — same input yields byte-identical output.
 *   2. Shared-evidence reuse — a combined multi-filing plan emits each shared
 *      evidence package exactly once, unioning its filing sections and markets.
 *   3. Specialization tailoring — the package/deliverable set varies by
 *      specialization (IVD analytical/clinical performance, SaMD software).
 */

import { describe, it, expect } from 'vitest';
import { compileWorkPackages, type WorkPackage } from '../work-packages';

const ids = (pkgs: WorkPackage[]) => pkgs.map((p) => p.id);
const byId = (pkgs: WorkPackage[], id: string) => pkgs.find((p) => p.id === id)!;

describe('compileWorkPackages — determinism', () => {
  it('produces byte-identical output for identical input', () => {
    const input = {
      specialization: 'medical_device' as const,
      pathways: ['510k'],
      markets: ['US'],
    };
    expect(JSON.stringify(compileWorkPackages(input))).toBe(
      JSON.stringify(compileWorkPackages(input)),
    );
  });

  it('always emits the universal lifecycle scaffolding', () => {
    const pkgs = compileWorkPackages({ specialization: null, pathways: [], markets: [] });
    const set = new Set(ids(pkgs));
    for (const id of [
      'regulatory-strategy',
      'design-controls',
      'risk-management',
      'labeling',
      'quality-manufacturing',
      'submission-assembly',
      'authority-review',
      'registration-udi',
      'postmarket',
    ]) {
      expect(set.has(id)).toBe(true);
    }
  });

  it('keeps dependsOn edges pointing only at in-plan packages', () => {
    const pkgs = compileWorkPackages({
      specialization: 'ivd_diagnostics',
      pathways: ['ivdr'],
      markets: ['EU'],
    });
    const present = new Set(ids(pkgs));
    for (const p of pkgs) {
      for (const dep of p.dependsOn) expect(present.has(dep)).toBe(true);
    }
  });
});

describe('compileWorkPackages — specialization tailoring', () => {
  it('gives IVD programs analytical + clinical performance, not bench/clinical-evidence', () => {
    const pkgs = compileWorkPackages({
      specialization: 'ivd_diagnostics',
      pathways: ['ivdr'],
      markets: ['EU'],
    });
    const set = new Set(ids(pkgs));
    expect(set.has('analytical-performance')).toBe(true);
    expect(set.has('clinical-performance')).toBe(true);
    expect(set.has('bench-performance-testing')).toBe(false);
    expect(set.has('clinical-evidence')).toBe(false);
  });

  it('gives physical devices bench + clinical evidence, not analytical performance', () => {
    const pkgs = compileWorkPackages({
      specialization: 'medical_device',
      pathways: ['510k'],
      markets: ['US'],
    });
    const set = new Set(ids(pkgs));
    expect(set.has('bench-performance-testing')).toBe(true);
    expect(set.has('clinical-evidence')).toBe(true);
    expect(set.has('analytical-performance')).toBe(false);
    expect(set.has('clinical-performance')).toBe(false);
  });

  it('adds SaMD software emphasis deliverables', () => {
    const samd = compileWorkPackages({ specialization: 'samd', pathways: ['510k'], markets: ['US'] });
    const device = compileWorkPackages({
      specialization: 'medical_device',
      pathways: ['510k'],
      markets: ['US'],
    });
    const samdSw = byId(samd, 'software-cybersecurity');
    const deviceSw = byId(device, 'software-cybersecurity');
    expect(samdSw.deliverables.some((d) => /predetermined change control plan/i.test(d))).toBe(true);
    expect(deviceSw.deliverables.some((d) => /predetermined change control plan/i.test(d))).toBe(false);
    expect(samdSw.deliverables.length).toBeGreaterThan(deviceSw.deliverables.length);
  });

  it('gives "both" the full evidence spread', () => {
    const pkgs = compileWorkPackages({ specialization: 'both', pathways: ['510k'], markets: ['US'] });
    const set = new Set(ids(pkgs));
    expect(set.has('bench-performance-testing')).toBe(true);
    expect(set.has('analytical-performance')).toBe(true);
    expect(set.has('clinical-evidence')).toBe(true);
    expect(set.has('clinical-performance')).toBe(true);
  });
});

describe('compileWorkPackages — shared-evidence dedupe/merge (dual pathway)', () => {
  // A dual 510(k)/CLIA program that also files EU IVDR: three filings, one
  // shared analytical evidence package.
  const pkgs = compileWorkPackages({
    specialization: 'both',
    pathways: ['dual_510k_clia', 'ivdr'],
    markets: ['US'],
  });

  it('emits each package id exactly once (no per-filing duplication)', () => {
    const seen = ids(pkgs);
    expect(seen.length).toBe(new Set(seen).size);
  });

  it('emits ONE analytical-performance package unioning all three filings', () => {
    const matches = pkgs.filter((p) => p.id === 'analytical-performance');
    expect(matches.length).toBe(1);
    const sections = matches[0].filingSectionsSupported;
    expect(sections.some((s) => s.startsWith('510k:'))).toBe(true);
    expect(sections.some((s) => s.startsWith('clia:'))).toBe(true);
    expect(sections.some((s) => s.startsWith('ivdr:'))).toBe(true);
  });

  it('unions applicableMarkets across US (510k/clia) and EU (ivdr) filings', () => {
    const analytical = byId(pkgs, 'analytical-performance');
    expect([...analytical.applicableMarkets].sort()).toEqual(['EU', 'US']);
  });

  it('unions clinical-performance sections across CLIA and IVDR', () => {
    const clinical = byId(pkgs, 'clinical-performance');
    const sections = clinical.filingSectionsSupported;
    expect(sections.some((s) => s.startsWith('clia:'))).toBe(true);
    expect(sections.some((s) => s.startsWith('ivdr:'))).toBe(true);
    expect([...clinical.applicableMarkets].sort()).toEqual(['EU', 'US']);
  });

  it('has no duplicate strings within a package section/market list', () => {
    for (const p of pkgs) {
      expect(p.filingSectionsSupported.length).toBe(new Set(p.filingSectionsSupported).size);
      expect(p.applicableMarkets.length).toBe(new Set(p.applicableMarkets).size);
      expect(p.deliverables.length).toBe(new Set(p.deliverables).size);
    }
  });
});

describe('compileWorkPackages — pathway normalization', () => {
  it('is tolerant of case/format variants and ignores unknown tokens', () => {
    const a = compileWorkPackages({ specialization: 'medical_device', pathways: ['510(k)'], markets: [] });
    const b = compileWorkPackages({ specialization: 'medical_device', pathways: ['510k'], markets: [] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const withGarbage = compileWorkPackages({
      specialization: 'medical_device',
      pathways: ['510k', 'totally-unknown-pathway'],
      markets: [],
    });
    expect(JSON.stringify(withGarbage)).toBe(JSON.stringify(b));
  });

  it('derives US market from a US-only filing when markets are unspecified', () => {
    const pkgs = compileWorkPackages({ specialization: 'medical_device', pathways: ['510k'], markets: [] });
    const bench = byId(pkgs, 'bench-performance-testing');
    expect(bench.applicableMarkets).toContain('US');
  });
});
