import { describe, expect, it } from 'vitest';
import { FILENAME_PATTERN, stfFileName, requiresStfReference, STF_NOT_REQUIRED_SECTIONS } from '../ectd-leaf-rules';
import { FILENAME_PATTERN as serverPattern } from '../../../server/services/ectd/ectd-regional-rules';
import { stfFileName as serverFileName } from '../../../server/services/ectd/stf-generator';
import { requiresStfReference as serverCoverage, STF_NOT_REQUIRED_SECTIONS as serverExemptions } from '../../../server/services/ectd/ectd4-validator';

describe('the existing eCTD leaf rules shared with placement', () => {
  it('keeps server compatibility exports bound to the same values', () => {
    expect(serverPattern).toBe(FILENAME_PATTERN);
    expect(serverFileName).toBe(stfFileName);
    expect(serverCoverage).toBe(requiresStfReference);
    expect(serverExemptions).toBe(STF_NOT_REQUIRED_SECTIONS);
  });
  it.each(['4.2.3.2', '5.3.5.1', 'm5.3.5.1', 'M4.2.1.1'])('requires STF coverage for %s', (section) => {
    expect(requiresStfReference(section)).toBe(true);
  });
  it.each(['4.3', '4.3.1', '5.2', 'm5.2.1', '5.3.6', '5.3.6.1', '5.4', '3.2.S.4.1', 'cover-letter', ''])('keeps %s exempt from STF coverage', (section) => {
    expect(requiresStfReference(section)).toBe(false);
  });
  it('preserves exact case-folded naming and its 64-character file boundary', () => {
    expect(stfFileName('STUDY-101')).toBe('stf-study-101.xml');
    expect(stfFileName('a'.repeat(56))).toHaveLength(64);
    expect(() => stfFileName('a'.repeat(57))).toThrow(/at most 64 characters/);
  });
  it.each(['STUDY 101', 'STUDY_101', '../STUDY', 'STUDY&101'])('retains the existing invalid-id message for %s', (id) => {
    expect(() => stfFileName(id)).toThrow(`Study id "${id}" cannot form its Study Tagging File name`);
  });
});
