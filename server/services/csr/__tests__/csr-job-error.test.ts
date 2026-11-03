/** No provider or database error may embed private trial data in CSR receipts. */
import { describe, expect, it } from 'vitest';
import { safeCsrJobFailure } from '../csr-job-error';

describe('CSR job failure receipts', () => {
  it('retains a stable typed CSR refusal, never the caller-supplied message', () => {
    const refusal = safeCsrJobFailure({
      code: 'CSR_SOURCE_CHANGED',
      message: 'Source changed: subject SYN-00042; password=untrusted-secret',
    });
    expect(refusal).toEqual({ code: 'CSR_SOURCE_CHANGED', message: 'CSR_SOURCE_CHANGED' });
    expect(JSON.stringify(refusal)).not.toMatch(/SYN-00042|untrusted-secret/);
  });

  it('preserves existing bare-code refusals used by the source pipeline', () => {
    expect(safeCsrJobFailure(new Error('CSR_EVIDENCE_STUDY_MISMATCH'))).toEqual({
      code: 'CSR_EVIDENCE_STUDY_MISMATCH', message: 'CSR_EVIDENCE_STUDY_MISMATCH',
    });
  });

  it.each([
    new Error('Connection failed at postgresql://user:password@private.host/db'),
    new Error('A model rejected the prompt: patient DOB and SAE narrative appear here'),
    'Subject SYN-004 is deceased',
    { code: 'CSR_BAD\npatient-data', message: 'secret medical note' },
    { code: 'insufficient_quota', message: 'organization private details' },
    null,
  ])('never puts an arbitrary error payload in persisted CSR JSON', error => {
    const value = safeCsrJobFailure(error);
    expect(value).toEqual({ message: 'CSR_BUILD_STEP_FAILED' });
    const serialized = JSON.stringify(value);
    expect(serialized).not.toMatch(/password|SYN-004|DOB|SAE narrative|patient-data|secret medical|organization private/);
  });

  it('does not admit excessively long or unbounded codes', () => {
    expect(safeCsrJobFailure({ code: 'CSR_' + 'A'.repeat(250) })).toEqual({
      message: 'CSR_BUILD_STEP_FAILED',
    });
  });
});
