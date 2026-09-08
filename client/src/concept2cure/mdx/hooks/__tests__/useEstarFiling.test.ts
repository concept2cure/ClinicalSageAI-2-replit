import { describe, it, expect } from 'vitest';
import {
  prerequisiteRows,
  registrationPatchToggling,
  correspondentValues,
  correspondentPatch,
  submissionsQueryUrl,
  ESTAR_PREREQUISITES,
  ESTAR_CORRESPONDENT_FIELDS,
  type EstarRegistrationRecord,
} from '../useEstarFiling';

const STORED = {
  id: 'r1',
  fdaEsgAccount: true,
  correspondentCompanyName: 'Acme Regulatory Ltd',
  correspondentContactEmail: 'ra@acme.example',
  correspondentTelephone: '+1 555 0100',
  declarationCompanyName: 'Declaring Entity GmbH',
  declarationCompanyAddress: '1 Main St, Springfield',
};

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

  it('carries the stored correspondent/declaration values so a toggle cannot blank them', () => {
    const patch = registrationPatchToggling(['fda_esg_account'], 'mdufa_fee_account', STORED);
    expect(patch.mdufaFeeAccount).toBe(true);
    expect(patch.correspondentCompanyName).toBe('Acme Regulatory Ltd');
    expect(patch.correspondentContactEmail).toBe('ra@acme.example');
    expect(patch.correspondentTelephone).toBe('+1 555 0100');
    expect(patch.declarationCompanyName).toBe('Declaring Entity GmbH');
    expect(patch.declarationCompanyAddress).toBe('1 Main St, Springfield');
  });
});

describe('correspondentValues (registration row → the five text fields)', () => {
  it('reads the five fields and nothing else', () => {
    expect(correspondentValues(STORED)).toEqual({
      correspondentCompanyName: 'Acme Regulatory Ltd',
      correspondentContactEmail: 'ra@acme.example',
      correspondentTelephone: '+1 555 0100',
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Main St, Springfield',
    });
  });

  it('is all-null for a missing row or a row without the columns — never a placeholder', () => {
    const blank = {
      correspondentCompanyName: null,
      correspondentContactEmail: null,
      correspondentTelephone: null,
      declarationCompanyName: null,
      declarationCompanyAddress: null,
    };
    expect(correspondentValues(null)).toEqual(blank);
    expect(correspondentValues({})).toEqual(blank);
    /* A non-string in the column (a driver oddity) reads as null, not as text. */
    expect(correspondentValues({ correspondentTelephone: 5 } as unknown as EstarRegistrationRecord)).toEqual(blank);
  });

  /* The Declaration of Conformity is signed by ONE legal entity, so its name
     and address are adjacent — the name first, directly above the address. */
  it('keeps the field list in display order, the declaration name before its address', () => {
    expect(ESTAR_CORRESPONDENT_FIELDS.map((f) => f.field)).toEqual([
      'correspondentCompanyName',
      'correspondentContactEmail',
      'correspondentTelephone',
      'declarationCompanyName',
      'declarationCompanyAddress',
    ]);
    const labels = Object.fromEntries(ESTAR_CORRESPONDENT_FIELDS.map((f) => [f.field, f.label]));
    expect(labels.declarationCompanyName).toBe('Declaration of Conformity company name');
    /* The width the server accepts for the column, not a smaller guess. */
    const max = Object.fromEntries(ESTAR_CORRESPONDENT_FIELDS.map((f) => [f.field, f.max]));
    expect(max.declarationCompanyName).toBe(256);
  });
});

describe('correspondentPatch (PUT /registration body for the text block)', () => {
  it('sends every text field trimmed, an emptied one as null, and preserves the booleans', () => {
    const patch = correspondentPatch(['fda_esg_account', 'organization_identity'], {
      correspondentCompanyName: '  Acme Regulatory Ltd ',
      correspondentContactEmail: 'ra@acme.example',
      correspondentTelephone: '',
      declarationCompanyName: ' Declaring Entity GmbH ',
      declarationCompanyAddress: '   ',
    });
    expect(patch).toEqual({
      fdaEsgAccount: true,
      cdrhPortalAccount: false,
      organizationIdentity: true,
      mdufaFeeAccount: false,
      correspondentCompanyName: 'Acme Regulatory Ltd',
      correspondentContactEmail: 'ra@acme.example',
      correspondentTelephone: null,
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: null,
    });
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
