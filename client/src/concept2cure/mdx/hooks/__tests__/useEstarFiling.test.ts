import { describe, it, expect } from 'vitest';
import {
  prerequisiteRows,
  registrationPatchToggling,
  submissionsQueryUrl,
  ESTAR_PREREQUISITES,
} from '../useEstarFiling';

describe('prerequisiteRows (eSTAR registration → prerequisite chips)', () => {
  it('marks satisfied prerequisites and leaves the rest missing', () => {
    const rows = prerequisiteRows(['fda_esg_account', 'organization_identity']);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.id === 'fda_esg_account')?.satisfied).toBe(true);
    expect(rows.find((r) => r.id === 'organization_identity')?.satisfied).toBe(true);
    expect(rows.find((r) => r.id === 'mdufa_fee_account')?.satisfied).toBe(false);
    expect(rows.find((r) => r.id === 'cdrh_portal_account')?.satisfied).toBe(false);
  });

  it('handles null/undefined as nothing satisfied', () => {
    expect(prerequisiteRows(null).every((r) => !r.satisfied)).toBe(true);
    expect(prerequisiteRows(undefined).every((r) => !r.satisfied)).toBe(true);
  });

  it('preserves the canonical prerequisite order and set', () => {
    const rows = prerequisiteRows([]);
    expect(rows.map((r) => r.id)).toEqual(ESTAR_PREREQUISITES.map((p) => p.id));
  });
});

describe('registrationPatchToggling (PUT /registration body builder)', () => {
  it('flips the toggled prerequisite and preserves the rest as booleans', () => {
    const patch = registrationPatchToggling(['fda_esg_account'], 'cdrh_portal_account');
    expect(patch.fdaEsgAccount).toBe(true); // preserved (was held)
    expect(patch.cdrhPortalAccount).toBe(true); // toggled on (was missing)
    expect(patch.organizationIdentity).toBe(false);
    expect(patch.mdufaFeeAccount).toBe(false);
  });

  it('toggles a held prerequisite off', () => {
    const patch = registrationPatchToggling(['fda_esg_account', 'mdufa_fee_account'], 'mdufa_fee_account');
    expect(patch.fdaEsgAccount).toBe(true);
    expect(patch.mdufaFeeAccount).toBe(false); // toggled off
  });

  it('emits all four camelCase boolean fields', () => {
    const patch = registrationPatchToggling([], 'fda_esg_account');
    expect(Object.keys(patch).sort()).toEqual(
      ['cdrhPortalAccount', 'fdaEsgAccount', 'mdufaFeeAccount', 'organizationIdentity'],
    );
  });
});

describe('submissionsQueryUrl (project/status filter contract)', () => {
  it('returns the bare endpoint when no filters are set', () => {
    expect(submissionsQueryUrl()).toBe('/api/510k/estar/submissions');
    expect(submissionsQueryUrl({})).toBe('/api/510k/estar/submissions');
  });

  it('scopes to a project (the PM-spine view)', () => {
    expect(submissionsQueryUrl({ projectId: 42 })).toBe('/api/510k/estar/submissions?projectId=42');
  });

  it('combines status and project filters', () => {
    const url = submissionsQueryUrl({ status: 'under_review', projectId: 7 });
    expect(url).toContain('status=under_review');
    expect(url).toContain('projectId=7');
  });

  it('ignores a non-positive or non-integer projectId rather than widening the query', () => {
    expect(submissionsQueryUrl({ projectId: 0 })).toBe('/api/510k/estar/submissions');
    expect(submissionsQueryUrl({ projectId: -1 })).toBe('/api/510k/estar/submissions');
    expect(submissionsQueryUrl({ projectId: 1.5 })).toBe('/api/510k/estar/submissions');
  });
});
