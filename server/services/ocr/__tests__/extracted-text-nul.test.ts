/**
 * Extracted text never carries a NUL (U+0000) into PostgreSQL.
 *
 * ── The defect (found 2026-10-30 by the founder-path lineage walk, LX-00 hop 6) ─
 * PostgreSQL refuses U+0000 in a text column ("invalid byte sequence for
 * encoding UTF8: 0x00"). A file whose extracted text held one, which a PDF text
 * layer or a DOCX run can, failed File to Vault with 500 INGEST_FAILED and
 * recorded nothing; the same text reached the Data Room writers. Each NUL is
 * replaced with U+FFFD, one UTF-16 unit for one, so every recorded page span
 * still addresses the same characters.
 */
import { describe, expect, it } from 'vitest';
import { extractDocumentText } from '../extractDocumentText';

describe('extracted text is safe for a PostgreSQL text column', () => {
  it('replaces each NUL with U+FFFD and keeps every offset', async () => {
    const raw = 'Section 1\u0000overview\u0000\u0000end';
    const out = await extractDocumentText(Buffer.from(raw, 'utf8'), 'text/plain', 'notes.txt');
    expect(out.text).not.toContain('\u0000');
    expect(out.text).toBe('Section 1�overview��end');
    expect(out.text.length).toBe(raw.length);
  });

  it('leaves text without a NUL exactly as extracted', async () => {
    const out = await extractDocumentText(Buffer.from('Clinical overview, 2.5.1', 'utf8'), 'text/plain', 'a.txt');
    expect(out.text).toBe('Clinical overview, 2.5.1');
  });
});
