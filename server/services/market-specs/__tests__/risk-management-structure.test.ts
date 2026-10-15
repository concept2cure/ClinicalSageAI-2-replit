/**
 * Tests for the ISO 14971 risk management file structure.
 */
import { describe, it, expect } from 'vitest';
import {
  RMF_SECTIONS,
  getRmfSection,
  rmfReviewerQuestions,
  assessRmfStructure,
  riskAcceptabilityPolicy,
  checkRmfAcceptabilityLanguage,
} from '../risk-management-structure';
import riskManagementStructure from '../risk-management-structure';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';

describe('risk management structure (ISO 14971)', () => {
  it('has the core RMF sections with reviewer questions', () => {
    const ids = RMF_SECTIONS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['plan', 'analysis', 'evaluation', 'control', 'overall_residual_risk', 'review', 'report', 'post_production']));
    for (const s of RMF_SECTIONS) expect(s.reviewerQuestions.length).toBeGreaterThan(0);
  });

  it('asks about pre-defined acceptability criteria and foreseeable misuse', () => {
    const qs = rmfReviewerQuestions();
    expect(qs.some((q) => q.sectionId === 'plan' && /acceptability criteria/i.test(q.question))).toBe(true);
    expect(qs.some((q) => q.sectionId === 'analysis' && /misuse/i.test(q.question))).toBe(true);
    expect(qs.some((q) => q.sectionId === 'control' && /priority order|design first/i.test(q.question))).toBe(true);
  });

  it('assesses completeness deterministically', () => {
    const all = RMF_SECTIONS.map((s) => s.id);
    expect(assessRmfStructure(all).ready).toBe(true);
    const partial = assessRmfStructure(['plan', 'analysis']);
    expect(partial.ready).toBe(false);
    expect(partial.missingRequiredSections).toContain('control');
    expect(partial.missingRequiredSections).toContain('overall_residual_risk');
  });

  it('looks up a section', () => {
    expect(getRmfSection('control')?.number).toBe('4');
    expect(getRmfSection('nope')).toBeUndefined();
  });
});

describe('risk acceptability policy by jurisdiction', () => {
  it('EU MDR and EU IVDR require AFAP with no economic justification, citing Annex I §2', () => {
    for (const j of ['EU_MDR', 'EU_IVDR'] as const) {
      const p = riskAcceptabilityPolicy(j);
      expect(p.jurisdiction).toBe(j);
      expect(p.principle).toBe('AFAP');
      expect(p.economicJustificationPermitted).toBe(false);
      expect(p.basis.some((b) => /Annex I §2/.test(b.ref))).toBe(true);
      expect(p.basis.some((b) => /Annex ZA/.test(b.ref))).toBe(true);
      expect(p.statement).toMatch(/as far as possible/i);
      expect(p.statement).toMatch(/benefit-risk ratio/i);
    }
    expect(riskAcceptabilityPolicy('EU_MDR').basis.some((b) => b.url?.includes('/eli/reg/2017/745'))).toBe(true);
    expect(riskAcceptabilityPolicy('EU_IVDR').basis.some((b) => b.url?.includes('/eli/reg/2017/746'))).toBe(true);
  });

  it('FDA follows the manufacturer-defined ISO 14971:2019 criteria (clauses 4.2 and 4.4)', () => {
    const p = riskAcceptabilityPolicy('FDA');
    expect(p.principle).toBe('manufacturer-defined');
    expect(p.basis.some((b) => /ISO 14971:2019/.test(b.ref) && /4\.2/.test(b.ref) && /4\.4/.test(b.ref))).toBe(true);
  });

  it('OTHER is not modelled and says so, asserting no economic permission it does not model', () => {
    const p = riskAcceptabilityPolicy('OTHER');
    expect(p.modelled).toBe(false);
    expect(p.economicJustificationPermitted).toBeNull();
    expect(riskAcceptabilityPolicy('EU_MDR').modelled).toBe(true);
  });

  it('FDA basis says clause 4.2 NOTE 1 lets the manufacturer\'s policy adopt ALARP, so economics are the manufacturer\'s choice', () => {
    const p = riskAcceptabilityPolicy('FDA');
    const notes = p.basis.map((b) => b.note ?? '').join(' ');
    expect(notes).toMatch(/clause 4\.2 NOTE 1[^.]*ALARP[^.]*manufacturer/i);
    expect(notes).toMatch(/economic considerations[^.]*manufacturer's choice/i);
    expect(notes).not.toMatch(/silent on economic/i);
  });

  it('never states that ISO 14971:2019 does not use ALARP: clause 4.2 NOTE 1 lists ALARP, ALARA and AFAP as policy options', () => {
    for (const j of ['EU_MDR', 'EU_IVDR', 'FDA', 'OTHER'] as const) {
      const p = riskAcceptabilityPolicy(j);
      const text = `${p.statement} ${p.basis.map((b) => b.note ?? '').join(' ')}`;
      expect(text).not.toMatch(/does not use ALARP|not use the term ALARP/i);
    }
    const iso = riskAcceptabilityPolicy('OTHER').basis.map((b) => b.note ?? '').join(' ');
    expect(iso).toMatch(/does not require ALARP/i);
    expect(iso).toMatch(/clause 4\.2 NOTE 1[^.]*ALARP[^.]*ALARA[^.]*AFAP/i);
  });

  it('FDA statement is labelled recall and calls ISO 14971:2019 a recognised consensus standard, not an FDA rule', () => {
    const s = riskAcceptabilityPolicy('FDA').statement;
    expect(s).toMatch(/^FDA \(recall\): ISO 14971:2019 is an FDA-recognised consensus standard\./);
    expect(s).not.toMatch(/applied as written/i);
  });

  it('the EU statement is scoped to devices', () => {
    expect(riskAcceptabilityPolicy('EU_MDR').statement).toMatch(/^For EU devices \(MDR\/IVDR\): /);
  });

  it('every basis is well formed and none is presented as checked regulator text', () => {
    for (const j of ['EU_MDR', 'EU_IVDR', 'FDA', 'OTHER'] as const) {
      for (const b of riskAcceptabilityPolicy(j).basis) {
        expect(basisProblems(b)).toEqual([]);
        expect(b.confidence).not.toBe('regulator-text');
      }
    }
  });

  it('is exported from the default export', () => {
    expect(typeof riskAcceptabilityPolicy).toBe('function');
    expect(typeof checkRmfAcceptabilityLanguage).toBe('function');
    expect(riskManagementStructure.riskAcceptabilityPolicy).toBe(riskAcceptabilityPolicy);
    expect(riskManagementStructure.checkRmfAcceptabilityLanguage).toBe(checkRmfAcceptabilityLanguage);
  });
});

describe('checkRmfAcceptabilityLanguage', () => {
  it('flags ALARP with a cost justification for the EU', () => {
    const f = checkRmfAcceptabilityLanguage('Residual risks were reduced ALARP considering cost', 'EU_MDR');
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(f.map((x) => x.rule)).toEqual(expect.arrayContaining(['alarp', 'economic-justification']));
  });

  it('flags the spelled-out phrase once, not again as "reasonably practicable"', () => {
    const f = checkRmfAcceptabilityLanguage('Risks are reduced as low as reasonably practicable.', 'EU_IVDR');
    expect(f.map((x) => x.rule)).toEqual(['as-low-as-reasonably-practicable']);
  });

  it('flags "reasonably practicable" on its own', () => {
    const f = checkRmfAcceptabilityLanguage('No further control is reasonably practicable.', 'EU_MDR');
    expect(f.map((x) => x.rule)).toEqual(['reasonably-practicable']);
  });

  it('flags economic or disproportionate stopping rules near residual risk', () => {
    const texts = [
      'Further risk controls were judged disproportionate to the benefit.',
      'Additional mitigation of the residual risk is not economically feasible.',
      'The residual risk was accepted because a redesign would cost too much.',
    ];
    for (const t of texts) {
      expect(checkRmfAcceptabilityLanguage(t, 'EU_MDR').map((x) => x.rule)).toContain('economic-justification');
    }
  });

  it('does not flag AFAP language that rules economics out', () => {
    const t = 'Risks were reduced as far as possible without adversely affecting the benefit-risk ratio, without any economic consideration, and not ALARP. Cost was never a reason to stop.';
    expect(checkRmfAcceptabilityLanguage(t, 'EU_MDR')).toEqual([]);
  });

  it('does not flag the EU policy statement itself', () => {
    expect(checkRmfAcceptabilityLanguage(riskAcceptabilityPolicy('EU_MDR').statement, 'EU_MDR')).toEqual([]);
    expect(checkRmfAcceptabilityLanguage('Costs are not considered when deciding whether to reduce a risk further.', 'EU_MDR')).toEqual([]);
  });

  it.each([
    'Further mitigation of the residual risk was not implemented for economic reasons.',
    'The residual risk is accepted; additional controls are not cost-effective.',
    'Risk reduction was stopped as there was no budget for a redesign.',
  ])('flags an economic stopping rule stated as a reason, as cost-effectiveness or as an absent budget: %s', (t) => {
    expect(checkRmfAcceptabilityLanguage(t, 'EU_MDR').map((x) => x.rule)).toContain('economic-justification');
  });

  it('still does not flag a sentence that rules a budget out as a reason', () => {
    expect(checkRmfAcceptabilityLanguage('Risk reduction was never limited by budget; no budget constraint applied to risk controls.', 'EU_MDR')).toEqual([]);
  });

  it('does not flag a cost stated as a fact, with no stopping or justification cue', () => {
    expect(checkRmfAcceptabilityLanguage('The risk control was implemented at a cost of USD 2,000.', 'EU_MDR')).toEqual([]);
  });

  it('does not flag ALARP that the sentence says was not applied', () => {
    expect(checkRmfAcceptabilityLanguage('ALARP was not applied; AFAP was.', 'EU_MDR')).toEqual([]);
    expect(checkRmfAcceptabilityLanguage('The ALARP principle is not used in this file.', 'EU_MDR')).toEqual([]);
  });

  it('flags ALARP used as a criterion even when a negation sits earlier in the sentence', () => {
    expect(checkRmfAcceptabilityLanguage('Risks are not acceptable unless ALARP.', 'EU_MDR').map((x) => x.rule)).toEqual(['alarp']);
  });

  it('returns [] for FDA and OTHER, where ISO 14971:2019 leaves the criteria to the manufacturer', () => {
    const t = 'Residual risks were reduced ALARP considering cost';
    expect(checkRmfAcceptabilityLanguage(t, 'FDA')).toEqual([]);
    expect(checkRmfAcceptabilityLanguage(t, 'OTHER')).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(checkRmfAcceptabilityLanguage('', 'EU_MDR')).toEqual([]);
  });
});
