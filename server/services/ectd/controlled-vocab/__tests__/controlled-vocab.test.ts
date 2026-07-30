/**
 * Controlled-vocabulary service — locks the FDA-published code values, the
 * code-system OIDs, and the v3.2.2 → v4.0 crosswalk that both publishing
 * engines depend on.
 */

import { describe, it, expect } from 'vitest';
import {
  getV4List,
  isValidV4Code,
  resolveV4Code,
  oidForV4List,
  isCodeSystemOidValid,
  isValidOid,
  getV3List,
  isValidV3Code,
  v3CodeToV4,
  fdaApplicationPrefix,
  applicationTypeToFdaCode,
  FDA_REGIONAL_IG_OID,
  V4_CODE_LISTS,
} from '../index';

describe('v4.0 genericode code lists', () => {
  it('carries the FDA-published application types with the correct OID', () => {
    const list = getV4List('applicationType');
    expect(list.oid).toBe('2.16.840.1.113883.3.989.5.1.2.2.1.1.4');
    expect(resolveV4Code('applicationType', 'us_application_type_1')?.description).toBe(
      'New Drug Application (NDA)',
    );
    expect(isValidV4Code('applicationType', 'us_application_type_3')).toBe(true); // BLA
    expect(isValidV4Code('applicationType', 'us_application_type_8')).toBe(false); // retired code
  });

  it('has the full 124-code context-of-use (Module 1 US regional) list', () => {
    const cou = getV4List('contextOfUse');
    expect(cou.codes.length).toBe(124);
    expect(isValidV4Code('contextOfUse', 'us_1.2')).toBe(true); // m1.2 cover letters
    expect(oidForV4List('contextOfUse')).toBe('2.16.840.1.113883.3.989.5.1.2.2.1.2.6');
  });

  it('exposes every documented list keyed by semantic id', () => {
    for (const id of [
      'applicationType', 'submissionType', 'submissionUnitType', 'contextOfUse',
      'formType', 'couKeywordDefinitionType', 'promotionalDocumentType',
      'promotionalMaterialAudienceType', 'promotionalMaterialType',
      'submissionContactType', 'submissionContactStatus', 'submissionUnitStatus',
      'telecomUse', 'telecomCapabilities',
    ] as const) {
      expect(V4_CODE_LISTS[id]).toBeDefined();
      expect(V4_CODE_LISTS[id].codes.length).toBeGreaterThan(0);
    }
  });
});

describe('OID validation', () => {
  it('accepts well-formed OIDs and rejects malformed ones', () => {
    expect(isValidOid(FDA_REGIONAL_IG_OID)).toBe(true);
    expect(isValidOid('2.16.840.1.113883.3.989.5.1.2.2.1.1.4')).toBe(true);
    expect(isValidOid('na')).toBe(false);
    expect(isValidOid('2.16.840..1')).toBe(false);
    expect(isValidOid('3.0.1')).toBe(false); // first arc must be 0-2
    expect(isValidOid(undefined)).toBe(false);
  });

  it('validates a code system OID against its governing list', () => {
    expect(isCodeSystemOidValid('applicationType', '2.16.840.1.113883.3.989.5.1.2.2.1.1.4')).toBe(true);
    expect(isCodeSystemOidValid('applicationType', '2.16.840.1.999')).toBe(false);
    // status lists are not OID-governed → syntactic check only
    expect(isCodeSystemOidValid('submissionUnitStatus', '2.16.840.1.1')).toBe(true);
  });
});

describe('v3.2.2 coded attributes', () => {
  it('carries the confirmed FDA us-regional codes', () => {
    expect(isValidV3Code('applicationType', 'fdaat1')).toBe(true); // NDA (confirmed)
    expect(isValidV3Code('submissionType', 'fdast2')).toBe(true); // Efficacy Supplement (confirmed)
    expect(getV3List('formType').find((c) => c.code === 'fdaft2')?.description).toContain('356h');
    expect(getV3List('applicantContactType').find((c) => c.code === 'fdaact1')?.description).toBe(
      'Regulatory',
    );
  });
});

describe('v3.2.2 → v4.0 crosswalk (forward compatibility)', () => {
  it('maps application/submission codes to their v4.0 equivalents', () => {
    expect(v3CodeToV4('applicationType', 'fdaat1')).toBe('us_application_type_1'); // NDA
    expect(v3CodeToV4('submissionType', 'fdast1')).toBe('us_submission_type_1'); // Original
    expect(v3CodeToV4('submissionSubType', 'fdasst4')).toBe('us_submission_unit_type_4'); // Amendment
    expect(v3CodeToV4('applicationType', 'nope')).toBeNull();
  });

  it('resolves FDA server path prefixes for grouped-submission lifecycle refs', () => {
    expect(fdaApplicationPrefix('fdaat1')).toBe('nda');
    expect(fdaApplicationPrefix('fdaat4')).toBe('ind');
    expect(fdaApplicationPrefix('unknown')).toBeNull();
  });

  it('maps a canonical application-type string to its us-regional code', () => {
    expect(applicationTypeToFdaCode('IND')).toBe('fdaat4');
    expect(applicationTypeToFdaCode('bla')).toBe('fdaat3');
    expect(applicationTypeToFdaCode('unknown')).toBeNull();
  });
});
