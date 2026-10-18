/**
 * Computer system validation refuses a software type it does not know, and
 * does not invent a GxP impact (audit finding 12 of the f/g/h fabrication
 * sweep, 2026-10-15).
 *
 * What the code used to do: assessComputerSystemValidation fell back to
 * GAMP_CATEGORY_SPECS[1] for any softwareType outside the four it knows, so an
 * unknown or missing type was silently assessed as GAMP Category 3; and an
 * unstated gxpImpact (with directImpact unstated) became 'medium', printed as
 * "GxP impact medium" and used to pick the least rigorous assurance approach
 * for Category 1/3 software; an unstated electronicSignatures marked the
 * e-signature Part 11 controls not applicable.
 *
 * Now an unknown or missing softwareType is a ComputationRefusal, which AnA
 * relays as needs_parameters naming the field; and an assurance approach or a
 * Part 11 control that depends on an unstated input is 'undetermined'.
 */
import { describe, expect, it } from 'vitest';
import {
  assessComputerSystemValidation,
  type AssessCsvParams,
} from '../gmp-quality-systems-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string };
  }
  return undefined;
}

describe('assessComputerSystemValidation: softwareType and GxP impact', () => {
  it('refuses an unknown softwareType instead of assessing it as GAMP Category 3', () => {
    const err = thrown(() =>
      assessComputerSystemValidation({
        systemDescription: 'Cloud QMS',
        softwareType: 'saas' as unknown as AssessCsvParams['softwareType'],
      }),
    );

    expect(err?.name).toBe('ComputationRefusal');
    expect(err?.code).toBe('invalid_input');
    expect(err?.field).toBe('softwareType');
  });

  it('refuses a missing softwareType', () => {
    const err = thrown(() =>
      assessComputerSystemValidation({ systemDescription: 'Cloud QMS' } as unknown as AssessCsvParams),
    );

    expect(err?.name).toBe('ComputationRefusal');
    expect(err?.code).toBe('missing_input');
    expect(err?.field).toBe('softwareType');
  });

  it('does not print a GxP impact nobody assessed, or pick an approach that depends on it', () => {
    const r = assessComputerSystemValidation({ systemDescription: 'Label printer driver', softwareType: 'non_configured' });

    expect(r.riskBasedScalingNote).not.toMatch(/GxP impact medium/);
    expect(r.riskBasedScalingNote).toMatch(/GxP impact not assessed/);
    expect(r.assurance.approach).toBe('undetermined');
    expect(r.notAssessed).toEqual(['gxpImpact', 'directImpact', 'electronicSignatures']);
  });

  it('does not call e-signature controls inapplicable when nobody said whether e-signatures are used', () => {
    const r = assessComputerSystemValidation({ systemDescription: 'LIMS', softwareType: 'configured', gxpImpact: 'high' });
    const esig = r.part11Controls.filter((c) => /signature/i.test(c.control));

    expect(esig.length).toBe(2);
    expect(esig.every((c) => c.applicable === 'undetermined')).toBe(true);
    expect(r.assurance.approach).toBe('csa_risk_based_scripted');
  });

  it('still selects the approach a custom system gets at any impact', () => {
    const r = assessComputerSystemValidation({ systemDescription: 'In-house MES macro', softwareType: 'custom' });

    expect(r.gampClassification.category).toBe('5');
    expect(r.assurance.approach).toBe('traditional_scripted_csv');
  });
});

describe('assess_computer_system_validation through AnA', () => {
  it('relays an unknown softwareType as needs_parameters naming the field', async () => {
    const out = JSON.parse(
      await getToolHandler('assess_computer_system_validation')!(
        { systemDescription: 'Cloud QMS', softwareType: 'saas' } as never,
        {} as never,
      ),
    );

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('softwareType');
    expect(out).not.toHaveProperty('result');
  });
});
