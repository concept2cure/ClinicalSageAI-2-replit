import { describe, it, expect } from 'vitest';
import {
  resolveProjectMap,
  PHASE_ORDER,
  type ProjectPhase,
} from '../../shared/regulatory/project-map';

const phasesOf = (need: string): ProjectPhase[] =>
  resolveProjectMap(need).milestones.map((m) => m.phase);

const milestone = (need: string, phase: ProjectPhase) =>
  resolveProjectMap(need).milestones.find((m) => m.phase === phase);

const appsAt = (need: string, phase: ProjectPhase) =>
  (milestone(need, phase)?.apps ?? []).map((a) => a.id);

describe('project map — milestones and capability inventory', () => {
  it('a BLA runs the full program arc in order', () => {
    const phases = phasesOf('BLA');
    expect(phases).toEqual([
      'strategy', 'quality', 'nonclinical', 'clinical',
      'authoring', 'assembly', 'submission', 'review', 'post_market',
    ]);
    // milestones are ordered densely
    const plan = resolveProjectMap('BLA');
    expect(plan.milestones.map((m) => m.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('places each ability at the phase where it is actually needed', () => {
    expect(appsAt('BLA', 'quality')).toContain('cmc');
    expect(appsAt('BLA', 'nonclinical')).toContain('nonclinical');
    expect(appsAt('BLA', 'clinical')).toContain('biostatistics');
    expect(appsAt('BLA', 'clinical')).toContain('clinical_csr');
    expect(appsAt('BLA', 'authoring')).toContain('labeling');
    expect(appsAt('BLA', 'assembly')).toContain('submission_center');
    // market access is the in-scope post-market app for a marketing application;
    // pharmacovigilance is its own document type, so it surfaces as a NEEDED
    // deliverable here rather than a bundled app.
    expect(appsAt('BLA', 'post_market')).toContain('market_access');
    const postMarket = milestone('BLA', 'post_market');
    expect(postMarket?.deliverables.join(' ').toLowerCase()).toContain('pharmacovigilance');
  });

  it('carries claim-spine deliverables onto the milestone they belong to', () => {
    const clinical = milestone('BLA', 'clinical');
    expect(clinical?.objectives.map((o) => o.id)).toContain('efficacy');
    // the efficacy claim projects into Module 5 / 2.5 / 2.7
    expect(clinical?.deliverables.join(' ')).toMatch(/M5|M2\.7|M2\.5/);
  });

  it('the submission milestone carries the regional gateway', () => {
    const sub = milestone('BLA', 'submission');
    expect(sub?.gateway?.region).toBe('fda');
  });

  it('the inventory says WHEN each ability is first needed', () => {
    const plan = resolveProjectMap('BLA');
    const cmc = plan.inventory.apps.find((a) => a.id === 'cmc');
    expect(cmc?.firstNeededPhase).toBe('quality');
    const sc = plan.inventory.apps.find((a) => a.id === 'submission_center');
    // the submission center both assembles and transmits
    expect(sc?.neededAtPhases).toEqual(['assembly', 'submission']);
    expect(sc?.firstNeededPhase).toBe('assembly');
    // every available app appears in the inventory exactly once
    const ids = plan.inventory.apps.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a 510(k) program puts substantial-equivalence + device evidence in the clinical phase', () => {
    const ids = appsAt('510k', 'clinical');
    expect(ids).toContain('substantial_equiv');
    expect(ids).toContain('risk');
    expect(ids).toContain('human_factors');
    expect(ids).toContain('cybersecurity');
    // still a dossier → assembles and transmits
    expect(phasesOf('510k')).toContain('assembly');
    expect(phasesOf('510k')).toContain('submission');
  });

  it('a CDx PMA (IVD) builds analytical performance in the quality phase', () => {
    expect(appsAt('US_CDX_PMA', 'quality')).toContain('analytical_performance');
    expect(phasesOf('US_CDX_PMA')).toContain('submission'); // full IVD dossier
  });

  it('a single document (no program) does not fabricate evidence phases', () => {
    const phases = phasesOf('SOP');
    expect(phases).not.toContain('assembly');
    expect(phases).not.toContain('submission');
    // and never claims a phase outside the canonical order
    for (const p of phases) expect(PHASE_ORDER).toContain(p);
  });
});
