import { describe, it, expect } from 'vitest';
import {
  ESTAR_REGISTRATION_REQUIREMENTS,
  requirementsForEntry,
  assessClientEstarEligibility,
  canFile,
  type EstarClientRegistration,
} from '../estar-registration';
import { getCatalogEntry } from '../estar-catalog';

const ALL_REQS = ESTAR_REGISTRATION_REQUIREMENTS.map((r) => r.id);
const NON_FEE_REQS = ESTAR_REGISTRATION_REQUIREMENTS.filter((r) => !r.feeBearingOnly).map((r) => r.id);

describe('eSTAR client registration & eligibility', () => {
  it('fee-bearing marketing pathways require the MDUFA fee account; request types do not', () => {
    expect(requirementsForEntry(getCatalogEntry('510k')!)).toContain('mdufa_fee_account');
    expect(requirementsForEntry(getCatalogEntry('pma_original')!)).toContain('mdufa_fee_account');
    expect(requirementsForEntry(getCatalogEntry('de_novo')!)).toContain('mdufa_fee_account');
    // Fee-exempt request types
    expect(requirementsForEntry(getCatalogEntry('qsub_pre_submission')!)).not.toContain('mdufa_fee_account');
    expect(requirementsForEntry(getCatalogEntry('ide')!)).not.toContain('mdufa_fee_account');
    expect(requirementsForEntry(getCatalogEntry('513g')!)).not.toContain('mdufa_fee_account');
  });

  it('an unregistered client can file nothing and reports every missing requirement', () => {
    const reg: EstarClientRegistration = { clientId: 'org-1', satisfied: [] };
    const report = assessClientEstarEligibility(reg);
    expect(report.fullyRegistered).toBe(false);
    expect(report.eligibleKeys).toEqual([]);
    expect(report.missingRequirements.sort()).toEqual([...ALL_REQS].sort());
    expect(report.submissions.every((s) => !s.eligible)).toBe(true);
  });

  it('a client with the transport/portal/identity accounts can file request types but not fee-bearing pathways', () => {
    const reg: EstarClientRegistration = { clientId: 'org-2', satisfied: NON_FEE_REQS };
    const report = assessClientEstarEligibility(reg);
    // Fee-exempt requests are fileable.
    expect(report.eligibleKeys).toEqual(
      expect.arrayContaining(['qsub_pre_submission', 'ide', '513g', 'qsub_pma_day_100_meeting']),
    );
    // Fee-bearing marketing pathways are still blocked on the fee account.
    const k510 = report.submissions.find((s) => s.key === '510k')!;
    expect(k510.eligible).toBe(false);
    expect(k510.missing).toEqual(['mdufa_fee_account']);
    expect(report.fullyRegistered).toBe(false);
  });

  it('a fully-registered client can file every eSTAR need', () => {
    const reg: EstarClientRegistration = { clientId: 'org-3', satisfied: ALL_REQS };
    const report = assessClientEstarEligibility(reg);
    expect(report.fullyRegistered).toBe(true);
    expect(report.missingRequirements).toEqual([]);
    expect(report.eligibleKeys.length).toBe(report.submissions.length);
  });

  it('variant filtering scopes the catalog to what the client is set up for', () => {
    const reg: EstarClientRegistration = { clientId: 'org-4', satisfied: ALL_REQS, variants: ['ivd'] };
    const report = assessClientEstarEligibility(reg);
    // Every applicable entry must apply to the ivd variant.
    for (const s of report.submissions) {
      expect(getCatalogEntry(s.key)!.appliesToVariants).toContain('ivd');
    }
    expect(report.submissions.length).toBeGreaterThan(0);
  });

  it('canFile answers a single-key question and reports its blockers', () => {
    const reg: EstarClientRegistration = { clientId: 'org-5', satisfied: NON_FEE_REQS };
    expect(canFile(reg, 'ide')?.eligible).toBe(true);
    expect(canFile(reg, 'pma_original')?.eligible).toBe(false);
    expect(canFile(reg, 'pma_original')?.missing).toEqual(['mdufa_fee_account']);
    expect(canFile(reg, 'nonexistent' as never)).toBeUndefined();
  });
});
