/**
 * A submission's identity is stated, never defaulted, and four local checks are
 * a precheck, not an eCTD validation.
 *
 * Until 2026-10-15:
 *  - prepareSubmission recorded `applicationType ?? 'IND'` and
 *    `sequenceNumber ?? '0000'`: a submission prepared without either was
 *    recorded as an IND original sequence (an amendment recorded as 0000).
 *  - createAmendment computed the next sequence over `application_number = NULL`
 *    when the parent had none, matched nothing, and recorded '0001' whatever the
 *    parent's own sequence was.
 *  - validateSubmission set status 'validated', and submitToGateway answered
 *    "Validation passed.", on four local checks (file-name pattern, module
 *    presence, uploader-declared PDF/A, checksum presence). No backbone, DTD,
 *    content, regional or lifecycle validation ran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries: Array<{ sql: string; params: unknown[] }> = [];
let submission: Record<string, unknown> = {};
let validationCounts = { total: '0', errors: '0' };

const PASSING_DOC = {
  id: 1, module: 'm1', section_code: 'm1.2', document_type: 'xml', pdf_a_compliant: null,
  file_name: 'cover-letter.xml', document_path: 'm1/us/cover-letter.xml',
  md5_checksum: '0'.repeat(32), sha256_checksum: '1'.repeat(64),
};

vi.mock('../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      const s = sql.toUpperCase();
      if (s.includes('FROM ECTD_SUBMISSION_VALIDATIONS') && s.includes('COUNT(')) return { rows: [validationCounts] };
      if (s.includes('FROM ECTD_SUBMISSION_DOCUMENTS')) return { rows: [PASSING_DOC] };
      if (s.includes('MAX(SEQUENCE_NUMBER')) return { rows: [{ max_seq: null }] };
      if (s.includes('INSERT INTO ECTD_SUBMISSIONS')) return { rows: [{ id: 99 }] };
      if (s.includes('FROM ECTD_SUBMISSIONS WHERE')) return { rows: [submission] };
      return { rows: [] };
    },
  }),
}));

import { EctdSubmissionAgent } from '../ectd-submission-agent';

const agent = new EctdSubmissionAgent();
const inserts = () => queries.filter((q) => /INSERT INTO ectd_submissions\b/i.test(q.sql));
const statusWrites = () =>
  queries.filter((q) => /UPDATE ectd_submissions/i.test(q.sql) && /status\s*=/i.test(q.sql));

beforeEach(() => {
  queries.length = 0;
  submission = { id: 42, org_id: 7, status: 'assembling', submission_type: 'amendment', application_number: 'IND-123456', sequence_number: '0003' };
  validationCounts = { total: '0', errors: '0' };
});

describe('prepareSubmission refuses rather than defaulting the submission identity', () => {
  it('refuses a submission with no application type, and creates nothing', async () => {
    await expect(
      agent.prepareSubmission(7, { submissionType: 'amendment', agency: 'FDA', sequenceNumber: '0004' }),
    ).rejects.toThrow(/application type/i);
    expect(inserts()).toHaveLength(0);
  });

  it('refuses a submission with no sequence number, and creates nothing', async () => {
    await expect(
      agent.prepareSubmission(7, { submissionType: 'amendment', agency: 'FDA', applicationType: 'IND' }),
    ).rejects.toThrow(/sequence number/i);
    expect(inserts()).toHaveLength(0);
  });

  it('records the application type and sequence it was given', async () => {
    await agent.prepareSubmission(7, { submissionType: 'amendment', agency: 'FDA', applicationType: 'NDA', sequenceNumber: '0004' });
    const [insert] = inserts();
    expect(insert.params[3]).toBe('NDA');
    expect(insert.params[5]).toBe('0004');
  });
});

describe('createAmendment does not invent the next sequence number', () => {
  it('refuses when the parent records no application number', async () => {
    submission = { ...submission, application_number: null };
    await expect(agent.createAmendment(7, 42, {})).rejects.toThrow(/application number/i);
    expect(inserts()).toHaveLength(0);
  });
});

describe('the four local checks are reported as a precheck, not as validation', () => {
  it('validateSubmission does not mark the submission validated, and says what it did not assess', async () => {
    const { summary } = await agent.validateSubmission(7, 42);
    expect(summary.allPassed).toBe(true);
    expect(statusWrites().every((q) => !q.params.includes('validated'))).toBe(true);
    expect(statusWrites().every((q) => !/'validated'/.test(q.sql))).toBe(true);
    expect(summary).toMatchObject({ scope: 'precheck' });
    const notAssessed = (summary as { notAssessed?: string[] }).notAssessed ?? [];
    expect(notAssessed.join(' ')).toMatch(/backbone/i);
    expect(notAssessed.join(' ')).toMatch(/regional/i);
  });

  it('submitToGateway leaves the status where it was and does not say validation passed', async () => {
    validationCounts = { total: '4', errors: '0' };
    const out = await agent.submitToGateway(7, 42);
    expect(out.status).toBe('assembling');
    expect(out.transmitted).toBe(false);
    expect(out.message).not.toMatch(/validation passed/i);
    expect(out.message).toMatch(/NOT been transmitted/);
    expect(statusWrites()).toHaveLength(0);
  });
});
