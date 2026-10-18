/**
 * designMassBalanceStudy (AnA tool design_mass_balance_study) does not choose
 * the route or the subject for the caller (2026-10-15).
 *
 * route defaulted to 'oral', so a design with no route given read "Route of
 * administration: oral." and "Single-dose 14C human mass-balance/ADME study
 * (oral)". A call with no subject was designed as an animal study ("14C animal
 * mass-balance study (oral)").
 */
import { describe, expect, it } from 'vitest';
import { designMassBalanceStudy, type DesignMassBalanceStudyParams } from '../nonclinical-adme-knowledge';
import { DESIGN_MASS_BALANCE_STUDY } from '../../ana/nonclinicalAdmeTools';

const design = (p: unknown) => designMassBalanceStudy(p as DesignMassBalanceStudyParams);

describe('designMassBalanceStudy', () => {
  it('does not print a route nobody gave', () => {
    const r = design({ subject: 'human' });
    expect(r.doseGuidance.join(' '), 'dose guidance with route unstated').not.toMatch(/Route of administration: oral/);
    expect(r.summary).not.toMatch(/\(oral\)/);
    expect(r.summary).toMatch(/route not stated/);
    expect(r.doseGuidance.join(' ')).toMatch(/Route of administration: not stated/);
  });

  it('prints a stated route', () => {
    const r = design({ subject: 'human', route: 'iv' });
    expect(r.doseGuidance).toContain('Route of administration: iv.');
    expect(r.summary).toMatch(/\(iv\)/);
    expect(r.warnings.join(' ')).toMatch(/IV radiolabeled study/);
  });

  it('refuses to design a study for no stated subject', () => {
    expect(() => design({}), 'mass-balance design with subject unstated').toThrow(/subject/);
    expect(() => design({ subject: 'dog' })).toThrow(/subject/);
  });

  it('tells AnA the route is not assumed', () => {
    const props = DESIGN_MASS_BALANCE_STUDY.input_schema.properties as Record<string, { description: string }>;
    expect(props.route.description).not.toMatch(/Default oral/);
    expect(props.route.description).toMatch(/not assumed/i);
  });
});
