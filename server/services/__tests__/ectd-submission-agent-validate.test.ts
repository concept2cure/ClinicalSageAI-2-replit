/**
 * validateSubmission — an unverified PDF/A status is not a pass, and the
 * file-name rule is the eCTD rule (64 characters, lowercase, '.', '-').
 *
 * Rule 3 used to read `pdf_a_compliant !== false` — a null (never supplied)
 * flag reported "PDF/A status acceptable". Rule 1 used its own regex with no
 * length bound, so a 200-character name "followed naming conventions".
 */
import { describe, it, expect, vi } from 'vitest';

const LONG_NAME = `${'clinical-overview-'.repeat(4)}coauthor-documents-123456.pdf`;

vi.mock('../../db', () => ({
  getPool: () => ({
    query: async (sql: string, _params: unknown[] = []) => {
      const s = sql.toUpperCase();
      if (s.includes('FROM ECTD_SUBMISSION_DOCUMENTS')) {
        return {
          rows: [
            { id: 1, file_name: LONG_NAME, document_type: 'pdf', module: 'm1', section_code: 'm1.2', document_path: `m1/us/${LONG_NAME}`, pdf_a_compliant: null, md5_checksum: 'abc' },
            { id: 2, file_name: 'cover-letter.pdf', document_type: 'pdf', module: 'm1', section_code: 'm1.2', document_path: 'm1/us/cover-letter.pdf', pdf_a_compliant: true, md5_checksum: 'def' },
            { id: 3, file_name: 'Form_1571.pdf', document_type: 'pdf', module: 'm1', section_code: 'm1.1', document_path: 'm1/us/Form_1571.pdf', pdf_a_compliant: false, md5_checksum: 'ghi' },
          ],
        };
      }
      if (s.includes('FROM ECTD_SUBMISSIONS WHERE')) {
        return { rows: [{ id: 42, org_id: 7, status: 'draft', submission_type: 'amendment' }] };
      }
      return { rows: [] };
    },
  }),
}));

import { EctdSubmissionAgent } from '../ectd-submission-agent';

describe('EctdSubmissionAgent.validateSubmission', () => {
  it('does not pass an unverified PDF/A status, and applies the 64-character file-name rule', async () => {
    const { summary, validations } = await new EctdSubmissionAgent().validateSubmission(7, 42);
    const byDoc = (ruleId: string, name: string) => validations.find((v) => v.ruleId === ruleId && v.message.includes(name))!;

    expect(LONG_NAME.length).toBeGreaterThan(64);
    expect(byDoc('FILE_NAMING', LONG_NAME).passed).toBe(false);
    expect(byDoc('FILE_NAMING', 'Form_1571.pdf').passed).toBe(false);
    expect(byDoc('FILE_NAMING', 'cover-letter.pdf').passed).toBe(true);

    const unverified = byDoc('PDF_A_CHECK', LONG_NAME);
    expect(unverified.passed).toBe(false);
    expect(unverified.message).toMatch(/not been verified/);
    expect(unverified.message).not.toMatch(/acceptable/);

    const declared = byDoc('PDF_A_CHECK', 'cover-letter.pdf');
    expect(declared.passed).toBe(true);
    expect(declared.message).toMatch(/declared .* by the uploader; not verified by the platform/);

    expect(byDoc('PDF_A_CHECK', 'Form_1571.pdf').passed).toBe(false);
    expect(summary.allPassed).toBe(false);
  });
});
