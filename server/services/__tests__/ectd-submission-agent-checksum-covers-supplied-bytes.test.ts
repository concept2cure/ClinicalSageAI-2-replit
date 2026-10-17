/**
 * A document checksum is computed over bytes, or no checksum is recorded.
 *
 * Until 2026-10-15 addDocument computed `md5(content ?? fileName)`: with no
 * content supplied (the route makes it optional, and the file at documentPath is
 * never read) the stored md5_checksum was the MD5 of the FILE NAME. Rule 4
 * (CHECKSUM_PRESENT) only tested that the column was non-empty, so it could
 * never fail and reported "Checksum present for x.pdf" as if the bytes had been
 * fingerprinted. md5_checksum is NOT NULL (db/migrations/082), so with no bytes
 * the honest act is to refuse the document, and a stored row with no SHA-256
 * (the mark of a row written without content) fails Rule 4.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const queries: Array<{ sql: string; params: unknown[] }> = [];
let storedDocs: Array<Record<string, unknown>> = [];

vi.mock('../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      const s = sql.toUpperCase();
      if (s.includes('FROM ECTD_SUBMISSION_DOCUMENTS')) return { rows: storedDocs };
      if (s.includes('FROM ECTD_SUBMISSIONS WHERE')) {
        return { rows: [{ id: 42, org_id: 7, status: 'assembling', submission_type: 'amendment' }] };
      }
      if (s.includes('INSERT INTO ECTD_SUBMISSION_DOCUMENTS')) return { rows: [{ id: 1001 }] };
      return { rows: [] };
    },
  }),
}));

import { EctdSubmissionAgent } from '../ectd-submission-agent';

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  queries.length = 0;
  storedDocs = [];
});

describe('addDocument records a checksum only over supplied bytes', () => {
  it('refuses a document with no content, and writes nothing', async () => {
    await expect(
      new EctdSubmissionAgent().addDocument(7, 42, {
        module: 'm1',
        sectionCode: 'm1.2',
        documentPath: 'm1/us/cover-letter.pdf',
        fileName: 'cover-letter.pdf',
      }),
    ).rejects.toThrow(/content/i);
    expect(queries.some((q) => /INSERT INTO ectd_submission_documents/i.test(q.sql))).toBe(false);
  });

  it('computes MD5 and SHA-256 over the content when it is supplied', async () => {
    await new EctdSubmissionAgent().addDocument(7, 42, {
      module: 'm1',
      sectionCode: 'm1.2',
      documentPath: 'm1/us/cover-letter.pdf',
      fileName: 'cover-letter.pdf',
      content: 'cover letter body',
    });
    const insert = queries.find((q) => /INSERT INTO ectd_submission_documents/i.test(q.sql))!;
    expect(insert.params[8]).toBe(md5('cover letter body'));
    expect(insert.params[9]).toBe(sha256('cover letter body'));
    expect(insert.params[8]).not.toBe(md5('cover-letter.pdf'));
  });
});

describe('Rule 4 (CHECKSUM_PRESENT) says what the checksum covers', () => {
  const doc = (over: Record<string, unknown>) => ({
    id: 1, module: 'm1', section_code: 'm1.2', document_type: 'xml', pdf_a_compliant: null,
    file_name: 'cover-letter.xml', document_path: 'm1/us/cover-letter.xml', ...over,
  });

  it('fails a row whose MD5 was computed from its file name (no content, so no SHA-256)', async () => {
    storedDocs = [doc({ md5_checksum: md5('cover-letter.xml'), sha256_checksum: null })];
    const { validations } = await new EctdSubmissionAgent().validateSubmission(7, 42);
    const rule4 = validations.find((v) => v.ruleId === 'CHECKSUM_PRESENT')!;
    expect(rule4.passed).toBe(false);
    expect(rule4.severity).toBe('error');
    expect(rule4.message).not.toMatch(/^Checksum present/);
    expect(rule4.message).toMatch(/no (document )?(content|bytes)/i);
  });

  it('passes a row checksummed over supplied content, and says the file itself was not read', async () => {
    storedDocs = [doc({ md5_checksum: md5('<xml/>'), sha256_checksum: sha256('<xml/>') })];
    const { validations } = await new EctdSubmissionAgent().validateSubmission(7, 42);
    const rule4 = validations.find((v) => v.ruleId === 'CHECKSUM_PRESENT')!;
    expect(rule4.passed).toBe(true);
    expect(rule4.message).toMatch(/content supplied/i);
    expect(rule4.message).toMatch(/not read/i);
  });
});
