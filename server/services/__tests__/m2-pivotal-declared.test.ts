/**
 * Module 2 calls a study pivotal only when the sponsor has declared it
 * (founder's decision of 2026-10-29; csr/study-pivotal-declaration.ts).
 *
 * buildM25ClinicalOverview and buildM27ClinicalSummary took "pivotal" to mean
 * "first phase named is 3", so a Phase 2/3 study such as LMN-201's was never
 * pivotal and every Phase 3 study always was, whatever the sponsor's position.
 * The declaration now decides, and a study with none is named as undeclared:
 * nothing is inferred from its phase.
 */
import { describe, expect, it } from 'vitest';
import { buildM25ClinicalOverview, buildM27ClinicalSummary, type CSRSummaryInput } from '../m2-summary-builders';

const study = (protocolNumber: string, phase: string, pivotal: boolean | null | undefined): CSRSummaryInput => ({
  studyId: protocolNumber, protocolNumber, phase,
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'global cure at week 8', primaryResult: 'recorded in §11.4',
  primaryEndpointMet: true, sampleSize: 23, saeCount: 0, deathCount: 0,
  ...(pivotal === undefined ? {} : { pivotal }),
});
const ctx = (csrs: CSRSummaryInput[]) => ({ csrs, indication: 'recurrent C. difficile infection', investigationalProduct: 'LMN-201' });

describe('Module 2.5 reads pivotal from the sponsor’s declaration', () => {
  it('a Phase 2/3 study declared pivotal is pivotal', () => {
    const r = buildM25ClinicalOverview(ctx([study('X-101', 'Phase 1', false), study('LMN-201-CDI02', 'Phase 2/3', true)]));
    expect(r.gaps.join(' | ')).not.toMatch(/pivotal .*efficacy evidence/);
    expect(r.narrative).toMatch(/Efficacy was demonstrated in 1 of 1 pivotal study/);
    expect(r.narrative).toMatch(/LMN-201-CDI02/);
  });

  it('a Phase 3 study declared not pivotal is not pivotal', () => {
    const r = buildM25ClinicalOverview(ctx([study('X-101', 'Phase 1', false), study('X-301', 'Phase 3', false)]));
    expect(r.gaps).toContain('pivotal efficacy evidence (no study is declared pivotal)');
  });

  it.each([[undefined], [null]])('an undeclared study (%j) is never inferred pivotal from its phase, and is named', (pivotal) => {
    const r = buildM25ClinicalOverview(ctx([study('X-101', 'Phase 1', false), study('X-301', 'Phase 3', pivotal)]));
    expect(r.gaps).toContain('pivotal efficacy evidence (no study is declared pivotal)');
    expect(r.gaps).toContain('pivotal status not declared for X-301');
  });

  it('no text says “pivotal (Phase 3)”: pivotal no longer means Phase 3', () => {
    const r = buildM25ClinicalOverview(ctx([study('LMN-201-CDI02', 'Phase 2/3', true)]));
    expect(r.narrative).not.toMatch(/pivotal \(Phase 3\)/);
    expect(r.gaps.join(' | ')).not.toMatch(/Phase 3\)/);
  });
});

describe('Module 2.7 reads pivotal from the sponsor’s declaration', () => {
  it('a Phase 2/3 study declared pivotal is pivotal; an undeclared Phase 3 study is named, not counted', () => {
    const r = buildM27ClinicalSummary(ctx([study('X-101', 'Phase 1', false), study('LMN-201-CDI02', 'Phase 2/3', true), study('X-301', 'Phase 3', null)]));
    expect(r.gaps).not.toContain('no pivotal efficacy study declared');
    expect(r.gaps).toContain('pivotal status not declared for X-301');
    expect(r.narrative).toMatch(/Efficacy was demonstrated in 1 of 1 pivotal study/);
    expect(r.narrative).toMatch(/• LMN-201-CDI02 \(Phase 2\/3\)/);
    expect(r.narrative).not.toMatch(/• X-301 \(Phase 3\)/);
  });

  it('with nothing declared pivotal, it says so', () => {
    const r = buildM27ClinicalSummary(ctx([study('X-101', 'Phase 1', false), study('X-301', 'Phase 3', undefined)]));
    expect(r.gaps).toContain('no pivotal efficacy study declared');
    expect(r.narrative).toMatch(/No study is declared pivotal\./);
  });
});
