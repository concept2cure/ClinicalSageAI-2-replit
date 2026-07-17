import { describe, it, expect } from 'vitest';
import { genuineDefectLeaves, type UnresolvedLeaf } from '../leaf-source-resolver';

const rowNotFound: UnresolvedLeaf = {
  documentTable: 'coauthor_documents',
  documentId: 12,
  reason: 'coauthor_documents row not found in this organization',
};
const unifiedMissing: UnresolvedLeaf = {
  documentTable: 'unified_documents',
  documentId: 7,
  reason: 'unified_documents row not found in this organization',
};
const unsupported: UnresolvedLeaf = {
  documentTable: 'mystery_table',
  documentId: 3,
  reason: 'unsupported document_table "mystery_table" — no resolver registered',
};
const vaultExternal: UnresolvedLeaf = {
  documentTable: 'vault_documents',
  documentId: 900,
  reason: 'vault_documents is an external S3-backed binary …',
};
const onboardingExternal: UnresolvedLeaf = {
  documentTable: 'ctd_onboarding_documents',
  documentId: 5,
  reason: 'ctd_onboarding_documents is an uploaded binary …',
};

describe('genuineDefectLeaves — transmit-gate classification', () => {
  it('flags a missing coauthor/unified row as a genuine defect', () => {
    expect(genuineDefectLeaves([rowNotFound])).toEqual([rowNotFound]);
    expect(genuineDefectLeaves([unifiedMissing])).toEqual([unifiedMissing]);
  });

  it('flags an unsupported document_table as a genuine defect', () => {
    expect(genuineDefectLeaves([unsupported])).toEqual([unsupported]);
  });

  it('does NOT flag known-external (S3 / onboarding) pointers as defects', () => {
    expect(genuineDefectLeaves([vaultExternal, onboardingExternal])).toEqual([]);
  });

  it('returns only the defect subset from a mixed set', () => {
    const mixed = [vaultExternal, rowNotFound, onboardingExternal, unsupported];
    expect(genuineDefectLeaves(mixed)).toEqual([rowNotFound, unsupported]);
  });

  it('treats a null document_table as a defect (fail closed)', () => {
    const nullTable: UnresolvedLeaf = { documentTable: null, documentId: null, reason: 'no source' };
    expect(genuineDefectLeaves([nullTable])).toEqual([nullTable]);
  });

  it('returns empty for no unresolved leaves', () => {
    expect(genuineDefectLeaves([])).toEqual([]);
  });
});
