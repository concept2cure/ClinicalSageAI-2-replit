import { describe, it, expect } from 'vitest';
import {
  resolveProjectMap,
  PHASE_ORDER,
  type ProjectPhase,
  type MilestoneStandard,
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

const standardsAt = (need: string, phase: ProjectPhase): MilestoneStandard[] =>
  milestone(need, phase)?.standards ?? [];

const stdIdsAt = (need: string, phase: ProjectPhase): string[] =>
  standardsAt(need, phase).map((s) => s.id);

describe('project map — per-milestone standards in force', () => {
  it('BLA quality phase carries the biologic CMC standard (ICH Q5A–Q5E)', () => {
    const ids = stdIdsAt('BLA', 'quality');
    expect(ids).toContain('ich_q5');
    const q5 = standardsAt('BLA', 'quality').find((s) => s.id === 'ich_q5')!;
    expect(q5.designation).toBe('ICH Q5A–Q5E');
    expect(q5.currentVersion).toBe('Q5A(R2) 2023');
    expect(q5.body).toBe('ICH');
    expect(q5.domain).toBe('cmc_biologic');
  });

  it('BLA clinical phase carries the efficacy guidelines (ICH E)', () => {
    expect(stdIdsAt('BLA', 'clinical')).toContain('ich_e_efficacy');
  });

  it('BLA nonclinical phase carries ICH S6', () => {
    expect(stdIdsAt('BLA', 'nonclinical')).toContain('ich_s6');
  });

  it('BLA strategy + submission + review carry the regulatory statute (PHS 351)', () => {
    expect(stdIdsAt('BLA', 'strategy')).toContain('phs_351');
    expect(stdIdsAt('BLA', 'submission')).toContain('phs_351');
    expect(stdIdsAt('BLA', 'review')).toContain('phs_351');
  });

  it('510(k) quality phase carries device QMS standards (ISO 13485, 21 CFR 820)', () => {
    const ids = stdIdsAt('510k', 'quality');
    expect(ids).toContain('iso_13485');
    expect(ids).toContain('cfr_820_qmsr');
  });

  it('510(k) clinical phase carries risk + human factors + cybersecurity standards', () => {
    const ids = stdIdsAt('510k', 'clinical');
    expect(ids).toContain('iso_14971');
    expect(ids).toContain('iec_62366_1');
    expect(ids).toContain('fdc_524b');
  });

  it('IVD (CDx PMA) quality phase carries CLSI EP and ISO 13485', () => {
    const ids = stdIdsAt('US_CDX_PMA', 'quality');
    expect(ids).toContain('clsi_ep_suite');
    expect(ids).toContain('iso_13485');
  });

  it('NDA (pharma) quality phase carries ICH Q chemistry, clinical carries ICH E', () => {
    expect(stdIdsAt('NDA', 'quality')).toContain('ich_q_chemistry');
    expect(stdIdsAt('NDA', 'clinical')).toContain('ich_e_efficacy');
    expect(stdIdsAt('NDA', 'nonclinical')).toContain('ich_m3_s');
  });

  it('every milestone standard carries a version (never blank)', () => {
    const plan = resolveProjectMap('BLA');
    for (const m of plan.milestones) {
      for (const s of m.standards) {
        expect(s.currentVersion.length).toBeGreaterThan(0);
        expect(s.designation.length).toBeGreaterThan(0);
      }
    }
  });

  it('a non-program document has no standards on its milestones', () => {
    const plan = resolveProjectMap('SOP');
    for (const m of plan.milestones) {
      expect(m.standards).toEqual([]);
    }
  });
});

const servicesAt = (need: string, phase: ProjectPhase): string[] =>
  milestone(need, phase)?.services ?? [];

describe('project map — service phase assignments', () => {
  it('financial_disclosures surfaces in the clinical phase', () => {
    expect(servicesAt('BLA', 'clinical')).toContain('financial_disclosures');
    expect(servicesAt('BLA', 'strategy')).not.toContain('financial_disclosures');
  });

  it('cmc_consistency surfaces in quality and assembly phases', () => {
    expect(servicesAt('NDA', 'quality')).toContain('cmc_consistency');
    expect(servicesAt('NDA', 'assembly')).toContain('cmc_consistency');
    expect(servicesAt('NDA', 'clinical')).not.toContain('cmc_consistency');
  });

  it('dose_optimization surfaces in the clinical phase for drug programs', () => {
    expect(servicesAt('NDA', 'clinical')).toContain('dose_optimization');
    expect(servicesAt('NDA', 'strategy')).not.toContain('dose_optimization');
  });

  it('effort_certification surfaces in the clinical phase for clinical trials', () => {
    expect(servicesAt('IND', 'clinical')).toContain('effort_certification');
  });

  it('special_designations surfaces in the strategy phase', () => {
    expect(servicesAt('BLA', 'strategy')).toContain('special_designations');
  });

  it('health_economics surfaces in strategy and post_market', () => {
    expect(servicesAt('NDA', 'strategy')).toContain('health_economics');
    expect(servicesAt('NDA', 'post_market')).toContain('health_economics');
  });

  it('inspection_readiness surfaces in quality and review', () => {
    expect(servicesAt('NDA', 'quality')).toContain('inspection_readiness');
    expect(servicesAt('NDA', 'review')).toContain('inspection_readiness');
  });

  it('controlled_substances surfaces in strategy and clinical for drug programs', () => {
    expect(servicesAt('NDA', 'strategy')).toContain('controlled_substances');
    expect(servicesAt('NDA', 'clinical')).toContain('controlled_substances');
  });

  it('cdx_intelligence surfaces in strategy and clinical for CDx filings', () => {
    expect(servicesAt('US_CDX_PMA', 'strategy')).toContain('cdx_intelligence');
    expect(servicesAt('US_CDX_PMA', 'clinical')).toContain('cdx_intelligence');
  });

  it('the service inventory says when each service is first needed', () => {
    const plan = resolveProjectMap('NDA');
    const fcoi = plan.inventory.services.find((s) => s.id === 'financial_disclosures');
    expect(fcoi?.firstNeededPhase).toBe('clinical');
    const cmc = plan.inventory.services.find((s) => s.id === 'cmc_consistency');
    expect(cmc?.firstNeededPhase).toBe('quality');
    expect(cmc?.neededAtPhases).toEqual(['quality', 'assembly']);
  });
});
