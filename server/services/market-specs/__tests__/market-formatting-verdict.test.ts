/**
 * The formatting validator says what it judged, from bytes, and what it did not.
 *
 * 2026-09-22 (W5/D7). Every byte-level fact was optional and each rule ran only
 * when its fact was present, so a report with nothing checked and a report with
 * everything checked were both `{errors: 0}`. In production those facts were
 * typed by a model, and the eSTAR build discarded the bytes it held.
 */
import { describe, it, expect } from 'vitest';
import { getMarketSpec } from '../market-submission-specs';
import { validateLeavesAgainstMarketSpec, measureLeafFile } from '../market-formatting-validator';
import { generateIndForm } from '../../ind-forms/ind-form-fill-service';

const usEctd = getMarketSpec('us-ectd')!;
const plainPdf = Buffer.from('%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
const securedPdf = Buffer.from('%PDF-1.4\ntrailer<</Root 1 0 R/Encr#79pt 5 0 R>>\n%%EOF\n', 'latin1');

describe('declared facts are claims', () => {
  it('a declared-clean PDF is NOT assessed for security or size — the verdict says so', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [
      { fileName: 'cover-letter.pdf', filePath: 'm1/us/cover-letter.pdf', fileFormat: 'PDF', fileSizeBytes: 1024, encrypted: false },
    ]);
    expect(r.errors).toBe(0);
    expect(r.verdict).toBe('not_assessed');
    const rules = r.notAssessed.map((n) => n.rule);
    expect(rules).toContain('PDF_NO_SECURITY');
    expect(r.notAssessed.find((n) => n.rule === 'PDF_NO_SECURITY')?.leaves).toEqual(['cover-letter.pdf']);
  });

  it('a declared violation is still reported, and marked as declared', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'locked.pdf', filePath: 'm1/us/locked.pdf', encrypted: true }]);
    expect(r.verdict).toBe('nonconformant');
    expect(r.findings.find((f) => f.rule === 'PDF_NO_SECURITY')?.message).toMatch(/as declared/);
  });

  it('a file with no extension or format is not judged for type — it used to pass', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'readme', filePath: 'm1/us/readme' }]);
    expect(r.notAssessed.some((n) => n.rule === 'ACCEPTED_FILE_TYPES')).toBe(true);
    expect(r.verdict).not.toBe('conformant');
  });

  it('no files is not a conformant package', () => {
    expect(validateLeavesAgainstMarketSpec(usEctd, []).verdict).toBe('not_assessed');
  });
});

describe('measured facts', () => {
  it('reads encryption from the bytes and calls a measured clean set conformant', async () => {
    const clean = await measureLeafFile({ fileName: 'overview.pdf', filePath: 'm2/25/overview.pdf', bytes: plainPdf }, 'us');
    expect(validateLeavesAgainstMarketSpec(usEctd, [clean])).toMatchObject({ verdict: 'conformant', errors: 0, notAssessed: [] });

    const locked = await measureLeafFile({ fileName: 'locked.pdf', filePath: 'm2/25/locked.pdf', bytes: securedPdf }, 'us');
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ ...locked, encrypted: false }]);
    expect(r.verdict).toBe('nonconformant');
    expect(r.findings.some((f) => f.rule === 'PDF_NO_SECURITY')).toBe(true);
  });

  it('does not flag an FDA form submitted as FDA issued it', async () => {
    const form = Buffer.from((await generateIndForm('FDA_1571', { sponsorName: 'C2C', indNumber: '162045' } as never)).pdfBytes);
    const m = await measureLeafFile({ fileName: 'form-fda-1571.pdf', filePath: 'm1/us/form-fda-1571.pdf', bytes: form }, 'us');
    expect(m.measured?.security).toBe('agency-form-as-issued');
    const r = validateLeavesAgainstMarketSpec(usEctd, [m]);
    expect(r.findings.some((f) => f.rule === 'PDF_NO_SECURITY')).toBe(false);
  });
});
