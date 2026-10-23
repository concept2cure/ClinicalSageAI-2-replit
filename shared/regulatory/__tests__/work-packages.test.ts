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

describe('compileWorkPackages — project discipline workflow', () => {
  const device = { specialization: 'medical_device' as const, pathways: ['510k'], markets: ['US'] };

  it('names accountable disciplines and conditional specialist benches without inventing assignments', () => {
    const plan = compileWorkPackages(device);
    for (const pkg of plan) {
      expect(pkg.ownerDiscipline.length).toBeGreaterThan(0);
      expect(pkg.contributors.length).toBeGreaterThan(0);
      expect(pkg.applicability.length).toBeGreaterThan(0);
    }
    expect(byId(plan, 'regulatory-strategy').ownerDiscipline).toBe('Regulatory Affairs');
    expect(byId(plan, 'submission-assembly').ownerDiscipline).toBe('Regulatory Operations / Publishing');
    expect(byId(plan, 'medical-writing').ownerDiscipline).toBe('Medical Writing');
    expect(byId(plan, 'quality-manufacturing').ownerDiscipline).toBe('Quality Assurance / Quality Systems');
    expect(byId(plan, 'manufacturing-transfer').ownerDiscipline).toBe('Manufacturing / Operations');
    expect(byId(plan, 'human-factors-usability').deliverables.join(' ')).toMatch(/use-related risk/i);
    for (const id of ['electrical-safety-emc', 'biocompatibility', 'sterilization-microbiology']) {
      expect(byId(plan, id).applicability).toMatch(/conditional/i);
    }
  });

  it('preserves unknown versus explicitly absent software, sterility and 510(k) clinical data', () => {
    const unknown = compileWorkPackages({ ...device, deviceFlags: null });
    const absent = compileWorkPackages({ ...device, deviceFlags: [] });
    expect(unknown).toEqual(compileWorkPackages(device));
    for (const id of ['software-cybersecurity', 'sterilization-microbiology', 'clinical-evidence']) {
      expect(byId(unknown, id).applicability).toMatch(/conditional/i);
      expect(ids(absent)).not.toContain(id);
    }
    // No flags establish absence of body contact or electrical power.
    expect(byId(absent, 'biocompatibility').applicability).toMatch(/conditional/i);
    expect(byId(absent, 'electrical-safety-emc').applicability).toMatch(/conditional/i);
    const present = compileWorkPackages({ ...device, deviceFlags: ['softwareAiMl', 'cyberDevice', 'sterile', 'clinicalData'] });
    expect(ids(present)).toEqual(expect.arrayContaining(['software-cybersecurity', 'sterilization-microbiology', 'clinical-evidence']));
    expect(byId(present, 'software-cybersecurity').applicability).toMatch(/524B/);
  });

  it('retains SaMD software even with no flags and preserves MDR clinical evaluation', () => {
    const samd = compileWorkPackages({ specialization: 'samd', pathways: ['eu_mdr'], markets: ['EU'], deviceFlags: [] });
    expect(ids(samd)).toContain('software-cybersecurity');
    const cer = byId(samd, 'clinical-evidence');
    expect(cer.ownerDiscipline).toBe('Clinical Affairs');
    expect(cer.title).toMatch(/clinical evaluation/i);
    expect(cer.contributors).toEqual(expect.arrayContaining(['Literature Specialists', 'Clinicians / Medical Experts', 'Biostatistics / Epidemiology']));
    expect(cer.deliverables.join(' ')).toMatch(/qualified.*evaluator/i);
    expect(cer.deliverables.join(' ')).toMatch(/search protocol/i);
    expect(cer.deliverables.join(' ')).toMatch(/screening/i);
    expect(cer.deliverables.join(' ')).toMatch(/appraisal/i);
    expect(cer.deliverables.join(' ')).toMatch(/state.of.the.art/i);
    expect(cer.deliverables.join(' ')).toMatch(/GSPR/);
    expect(cer.dependsOn).not.toContain('bench-performance-testing');
    expect(byId(samd, 'postmarket').deliverables.join(' ')).toMatch(/PMCF/);
    expect(byId(samd, 'postmarket').dependsOn).not.toContain('authority-review');
  });

  it('keeps diagnostic PER synthesis distinct from MDR CER and reuses analytical/clinical evidence', () => {
    const plan = compileWorkPackages({ specialization: 'ivd_diagnostics', pathways: ['510k', 'eu_ivdr'], markets: [], deviceFlags: [] });
    expect(ids(plan)).not.toContain('clinical-evidence');
    const per = byId(plan, 'performance-evaluation');
    expect(per.title).toMatch(/PER/);
    expect(per.deliverables.join(' ')).toMatch(/scientific validity/i);
    expect(per.deliverables.join(' ')).toMatch(/analytical performance/i);
    expect(per.deliverables.join(' ')).toMatch(/clinical performance/i);
    expect(per.deliverables.join(' ')).toMatch(/PMPF/);
    expect(per.deliverables.join(' ')).not.toMatch(/\bCER\b|\bPMCF\b/);
    expect(per.dependsOn).toEqual(expect.arrayContaining(['analytical-performance', 'clinical-performance']));
    for (const id of ['analytical-performance', 'clinical-performance']) {
      expect(plan.filter(pkg => pkg.id === id)).toHaveLength(1);
      expect(byId(plan, id).applicableMarkets.slice().sort()).toEqual(['EU', 'US']);
    }
    expect(byId(plan, 'analytical-performance').deliverables.join(' ')).toMatch(/cross-reactivity/i);
    expect(byId(plan, 'clinical-performance').deliverables.join(' ')).toMatch(/reference intervals/i);
    expect(byId(plan, 'postmarket').deliverables.join(' ')).toMatch(/PMPF/);
  });

  it('uses performance evidence for a companion diagnostic without adding a device CER track', () => {
    for (const pathways of [['IVDR'], ['510k', 'ivdr'], ['pma']]) {
      const plan = compileWorkPackages({ specialization: 'companion_diagnostic', pathways, markets: [], deviceFlags: [] });
      expect(ids(plan)).not.toContain('clinical-evidence');
      expect(ids(plan)).toEqual(expect.arrayContaining(['analytical-performance', 'clinical-performance']));
    }
    const combined = compileWorkPackages({ specialization: 'companion_diagnostic', pathways: ['mdr', 'ivdr'], markets: [] });
    expect(ids(combined)).toEqual(expect.arrayContaining(['clinical-evidence', 'performance-evaluation']));
  });

  it('tailors strategy and publishing to 510(k), MDR and IVDR without treating other filings as SE', () => {
    const us = compileWorkPackages(device);
    expect(byId(us, 'regulatory-strategy').deliverables.join(' ')).toMatch(/product code.*regulation number/i);
    expect(byId(us, 'regulatory-strategy').deliverables.join(' ')).toMatch(/Q-Sub/);
    expect(byId(us, 'medical-writing').deliverables.join(' ')).toMatch(/510\(k\) summary/);
    expect(byId(us, 'submission-assembly').deliverables.join(' ')).toMatch(/eSTAR/);
    const eu = compileWorkPackages({ ...device, pathways: ['mdr', 'ivdr'] });
    expect(byId(eu, 'regulatory-strategy').deliverables.join(' ')).toMatch(/conformity route.*notified body/i);
    expect(byId(eu, 'submission-assembly').deliverables.join(' ')).toMatch(/Annexes II and III/);
    const denovo = compileWorkPackages({ ...device, pathways: ['de_novo'] });
    expect(byId(denovo, 'regulatory-strategy').deliverables.join(' ')).not.toMatch(/substantial equivalence/i);
  });

});

describe('compileWorkPackages — extended handoffs', () => {
  it('centres an MDR-only evaluation on Clinical Affairs and reuses engineering inputs', () => {
    const plan = compileWorkPackages({ specialization: 'medical_device', pathways: ['mdr'], markets: ['EU'], deviceFlags: [] });
    expect(ids(plan).slice(0, 2)).toEqual(['regulatory-strategy', 'clinical-evidence']);
    const inputs = byId(plan, 'design-controls');
    expect(inputs.title).toBe('Engineering inputs to clinical evaluation');
    expect(inputs.deliverables.join(' ')).toMatch(/existing design.*performance evidence/i);
    expect(inputs.deliverables.join(' ')).toMatch(/equivalence comparison tables/i);
    expect(inputs.deliverables.join(' ')).not.toMatch(/Design & development plan|Design history file \(DHF\) index/);
    const cer = byId(plan, 'clinical-evidence');
    expect(cer.ownerDiscipline).toBe('Clinical Affairs');
    expect(cer.dependsOn).toEqual(['design-controls', 'risk-management']);
    expect(cer.dependsOn).not.toEqual(expect.arrayContaining(['bench-performance-testing', 'authority-review']));
  });

  it('keeps every extended dependency valid and acyclic across device and diagnostic plans', () => {
    for (const specialization of ['medical_device', 'ivd_diagnostics', 'both', 'samd'] as const) {
      const plan = compileWorkPackages({ specialization, pathways: ['510k', 'mdr', 'ivdr'], markets: [], deviceFlags: [] });
      const present = new Set(ids(plan));
      const visited = new Set<string>();
      const visiting = new Set<string>();
      const visit = (id: string) => {
        expect(visiting.has(id)).toBe(false);
        if (visited.has(id)) return;
        visiting.add(id);
        for (const dep of byId(plan, id).dependsOn) { expect(present.has(dep)).toBe(true); visit(dep); }
        visiting.delete(id);
        visited.add(id);
      };
      for (const id of present) visit(id);
    }
  });
});
