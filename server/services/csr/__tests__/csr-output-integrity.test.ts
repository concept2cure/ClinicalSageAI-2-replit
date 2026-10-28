import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySavedCsrSectionIntegrity } from '../csr-output-integrity';

const stored = (sectionNumber: string, content: string) => ({
  sectionNumber, content, contentHash: createHash('sha256').update(content).digest('hex'),
});

describe('CSR saved-output final integrity gate', () => {
  it('accepts only exactly matched, nonblank saved content', () => {
    expect(verifySavedCsrSectionIntegrity(['11.4', '12.3'], [
      stored('11.4', 'Investigational endpoint narrative.'),
      stored('12.3', 'Verified safety narrative.'),
      stored('13', 'Unrelated section text.'),
    ])).toEqual({ missing: [], mismatched: [], covered: ['11.4', '12.3'] });
  });
  it('refuses a changed section even when the row exists and has prose', () => {
    const changed = stored('11.4', 'Original result from a verified output.');
    changed.content = 'Changed numerical result from an unverified edit.';
    expect(verifySavedCsrSectionIntegrity(['11.4'], [changed])).toMatchObject({
      missing: [], mismatched: ['11.4'], covered: [],
    });
  });
  it('treats absent and blank outputs as missing', () => {
    expect(verifySavedCsrSectionIntegrity(['11.4', '12.3'], [
      stored('11.4', ' \t '),
    ])).toEqual({ missing: ['11.4', '12.3'], mismatched: [], covered: [] });
  });
  it('refuses duplicate target output rows', () => {
    const output = stored('11.4', 'Retained text.');
    expect(verifySavedCsrSectionIntegrity(['11.4'], [output, output]).mismatched).toEqual(['11.4']);
  });
  it('never claims completion from empty or duplicate target selection', () => {
    expect(() => verifySavedCsrSectionIntegrity([], [])).toThrow('CSR_TARGETS_INVALID');
    expect(() => verifySavedCsrSectionIntegrity(['11.4', '11.4'], [stored('11.4', 'Text')]))
      .toThrow('CSR_TARGETS_INVALID');
  });
  it('requires a persisted hash, not an invented hash at read time', () => {
    const row = { sectionNumber: '11.4', content: 'The analysis was performed.', contentHash: null };
    expect(verifySavedCsrSectionIntegrity(['11.4'], [row]).mismatched).toEqual(['11.4']);
  });
  it('does not count an incomplete saved subset as complete coverage', () => {
    const result = verifySavedCsrSectionIntegrity(['11.4', '12.3', '13'], [
      stored('11.4', 'Supported efficacy narrative.'),
      stored('13', 'Supported discussion.'),
    ]);
    expect(result.covered).toEqual(['11.4', '13']);
    expect(result.missing).toEqual(['12.3']);
  });
  it('does not allow unrelated saved sections to satisfy requested coverage', () => {
    const result = verifySavedCsrSectionIntegrity(['11.4'], [
      stored('12.3', 'Safety narrative from another section.'),
    ]);
    expect(result.covered).toEqual([]);
    expect(result.missing).toEqual(['11.4']);
  });

});
