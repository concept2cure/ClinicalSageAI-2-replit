import { describe, it, expect } from 'vitest';
import { toClientRegistration } from '../estar-registration-service';
import type { EstarRegistrationRow } from '../../../../../shared/schema/estar-registration';
import { canFile } from '../estar-registration';

/**
 * Pure-bridge tests for the persistence→model mapping. DB CRUD is exercised by
 * the route/integration layer (needs a live pool); here we pin the mechanical
 * bridge and its interaction with the eligibility model.
 */

const row = (over: Partial<EstarRegistrationRow>): EstarRegistrationRow =>
  ({
    id: 'reg-1',
    organizationId: 42,
    fdaEsgAccount: false,
    cdrhPortalAccount: false,
    organizationIdentity: false,
    mdufaFeeAccount: false,
    esgAccountId: null,
    cdrhPortalEmail: null,
    duns: null,
    fei: null,
    mdufaOrgId: null,
    mdufaFeeTier: null,
    variants: ['device', 'ivd'],
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    ...over,
  }) as EstarRegistrationRow;

describe('toClientRegistration (persistence → eligibility model bridge)', () => {
  it('maps the four boolean columns to the satisfied[] requirement union', () => {
    const r = toClientRegistration(
      row({ fdaEsgAccount: true, cdrhPortalAccount: true, organizationIdentity: true, mdufaFeeAccount: true }),
    );
    expect(r.satisfied.sort()).toEqual(
      ['cdrh_portal_account', 'fda_esg_account', 'mdufa_fee_account', 'organization_identity'].sort(),
    );
    expect(r.clientId).toBe('42'); // opaque clientId = org id as string
    expect(r.variants).toEqual(['device', 'ivd']);
  });

  it('omits unsatisfied requirements', () => {
    const r = toClientRegistration(row({ fdaEsgAccount: true, cdrhPortalAccount: true, organizationIdentity: true }));
    expect(r.satisfied).not.toContain('mdufa_fee_account');
    expect(r.satisfied).toContain('fda_esg_account');
  });

  it('normalizes empty variants to undefined (model default = both)', () => {
    const r = toClientRegistration(row({ variants: [] as Array<'device' | 'ivd'> }));
    expect(r.variants).toBeUndefined();
  });

  it('a fully-registered client can file a fee-bearing PMA; a request-only client cannot', () => {
    const full = toClientRegistration(
      row({ fdaEsgAccount: true, cdrhPortalAccount: true, organizationIdentity: true, mdufaFeeAccount: true }),
    );
    expect(canFile(full, 'pma_original')?.eligible).toBe(true);

    const requestOnly = toClientRegistration(
      row({ fdaEsgAccount: true, cdrhPortalAccount: true, organizationIdentity: true, mdufaFeeAccount: false }),
    );
    expect(canFile(requestOnly, 'pma_original')?.eligible).toBe(false);
    // …but the same client CAN file a fee-exempt Q-Sub.
    expect(canFile(requestOnly, 'qsub_pre_submission')?.eligible).toBe(true);
  });
});
