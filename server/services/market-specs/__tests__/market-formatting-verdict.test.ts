/**
 * The formatting validator says what it judged, from bytes, and what it did not.
 *
 * 2026-09-22 (W5/D7). Every byte-level fact was optional and each rule ran only
 * when its fact was present, so a report with nothing checked and a report with
 * everything checked were both `{errors: 0}`. In production those facts were
 * typed by a model, and the eSTAR build discarded the bytes it held.
 */
import { describe, it, expect } from 'vitest';
import { getMarketSpec, MARKET_SUBMISSION_SPECS } from '../market-submission-specs';
import { validateLeavesAgainstMarketSpec, measureLeafFile } from '../market-formatting-validator';
import { generateIndForm } from '../../ind-forms/ind-form-fill-service';
import { isPdfLeaf } from '../../ectd/pdfa-detect';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

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

/*
 * 2026-09-23 (W5/D7, round-2 review). Two holes in the verdict above:
 *  - a declared format decided whether the security rule applied at all. The
 *    type rule accepted any substring of an accepted format ('estar', 'a',
 *    'PDF attachments') and the security rule applied only to a token of
 *    exactly 'pdf', so a declared-only leaf could come back 'conformant' with
 *    nothing read;
 *  - measureLeafFile judged PDF-ness by header alone, where the packager and
 *    transmit guard judge "name ends .pdf OR %PDF- header", and the type rule
 *    accepted a '.pdf' name whose bytes are not a PDF.
 */
describe('a declared format never narrows which byte rules apply', () => {
  const usEstar = getMarketSpec('us-estar')!;

  it.each(['PDF attachments', 'PDF (eSTAR form)', 'PDF/A-1b', 'eSTAR'])(
    'us-estar leaf declared %j and never read is not_assessed, with PDF_NO_SECURITY listed',
    (fileFormat) => {
      const r = validateLeavesAgainstMarketSpec(usEstar, [{ fileName: 'device-description.pdf', fileFormat }]);
      expect(r.verdict).toBe('not_assessed');
      expect(r.notAssessed.find((n) => n.rule === 'PDF_NO_SECURITY')?.leaves).toEqual(['device-description.pdf']);
    },
  );

  it('an unread leaf declared as a non-PDF format is still not assessed for security', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'adsl.xpt', filePath: 'm5/datasets/adsl.xpt', fileFormat: 'XPT', fileSizeBytes: 10 }]);
    // Unread, it may be PDF bytes under any name — the packager judges those by header.
    expect(r.notAssessed.find((n) => n.rule === 'PDF_NO_SECURITY')?.leaves).toEqual(['adsl.xpt']);
  });

  it('a declared encrypted:true is still a finding, not a not-assessed entry', () => {
    const r = validateLeavesAgainstMarketSpec(usEstar, [{ fileName: 'locked.pdf', fileFormat: 'PDF attachments', encrypted: true }]);
    expect(r.verdict).toBe('nonconformant');
    expect(r.notAssessed.some((n) => n.rule === 'PDF_NO_SECURITY')).toBe(false);
  });
});

describe('accepted file types match canonical format tokens, not substrings', () => {
  const typeFinding = (spec: typeof usEctd, fileName: string, fileFormat?: string) =>
    validateLeavesAgainstMarketSpec(spec, [{ fileName, ...(fileFormat ? { fileFormat } : {}) }]).findings.some(
      (f) => f.rule === 'ACCEPTED_FILE_TYPES',
    );

  it.each([
    ['us-estar', 'x.pdf', 'estar'],
    ['us-estar', 'x.pdf', 'form'],
    ['us-estar', 'x.docx', 'a'],
    ['us-estar', 'x.pdf', 'attachments'],
    ['us-ectd', 'x.pdf', 'pd'],
    ['us-ectd', 'x.pdf', 'df'],
  ])('%s refuses the fragment token %j (declared %j)', (specId, fileName, fileFormat) => {
    expect(typeFinding(getMarketSpec(specId)!, fileName, fileFormat)).toBe(true);
  });

  it.each([
    ['us-estar', 'x.pdf', 'PDF (eSTAR form)'],
    ['us-estar', 'x.pdf', 'PDF attachments'],
    ['us-estar', 'x.pdf', 'PDF'],
    ['us-estar', 'x.pdf', undefined],
    ['us-ectd', 'x.pdf', 'PDF/A-1b'],
    ['us-ectd', 'x.PDF', undefined],
    ['eu-mdr', 'td.pdf', 'pdf/a'],
  ])('%s accepts %j declared %j as a PDF', (specId, fileName, fileFormat) => {
    expect(typeFinding(getMarketSpec(specId)!, fileName, fileFormat)).toBe(false);
  });

  it.each(['x.docx', 'x.xpt', 'x.xml', 'x.xlsx', 'x.txt'])('every spec is PDF-only, so %s is flagged on each and x.pdf on none', (fileName) => {
    for (const spec of MARKET_SUBMISSION_SPECS) {
      expect(typeFinding(spec, fileName), spec.id).toBe(true);
      expect(typeFinding(spec, 'x.pdf'), spec.id).toBe(false);
    }
  });
});

describe('one "is this a PDF leaf" predicate: name ends .pdf OR %PDF- in the first 1 KB', () => {
  const zipBytes = Buffer.from('PK\x03\x04' + 'x'.repeat(200), 'latin1');
  const lateHeaderSecured = Buffer.from(' '.repeat(1100) + '%PDF-1.4\ntrailer<</Root 1 0 R/Encrypt 5 0 R>>\n%%EOF\n', 'latin1');

  it('pdfa-detect exports the predicate', () => {
    expect(isPdfLeaf('report.PDF', zipBytes)).toBe(true);
    expect(isPdfLeaf('report.bin', plainPdf)).toBe(true);
    expect(isPdfLeaf('report.bin', zipBytes)).toBe(false);
    expect(isPdfLeaf('report.bin', lateHeaderSecured)).toBe(false);
    expect(isPdfLeaf('report.pdf', lateHeaderSecured)).toBe(true);
  });

  it('a .pdf whose header is past 1 KB is judged for security — and refused, as the packager and transmit guard refuse it', async () => {
    const m = await measureLeafFile({ fileName: 'late-header.pdf', filePath: 'attachments/late-header.pdf', bytes: lateHeaderSecured }, 'us');
    expect(m.measured?.security).toBe('secured');
    const r = validateLeavesAgainstMarketSpec(getMarketSpec('us-estar')!, [m]);
    expect(r.verdict).toBe('nonconformant');
    expect(r.findings.some((f) => f.rule === 'PDF_NO_SECURITY')).toBe(true);
  });

  it('a .pdf whose bytes are not a PDF is reported under ACCEPTED_FILE_TYPES, not accepted by its extension', async () => {
    for (const [specId, market, path] of [['us-estar', 'us', 'attachments/test-report.pdf'], ['ca-ectd', 'ca', 'm1/ca/test-report.pdf']] as const) {
      const m = await measureLeafFile({ fileName: 'test-report.pdf', filePath: path, bytes: zipBytes }, market);
      const r = validateLeavesAgainstMarketSpec(getMarketSpec(specId)!, [m]);
      expect(r.verdict).toBe('nonconformant');
      expect(r.findings.find((f) => f.rule === 'ACCEPTED_FILE_TYPES')).toMatchObject({ severity: 'error', message: expect.stringMatching(/not a PDF/) });
    }
  });

  it('so does a leaf DECLARED as PDF whose bytes are not a PDF', async () => {
    const m = await measureLeafFile({ fileName: 'test-report.bin', fileFormat: 'PDF attachments', bytes: zipBytes }, 'us');
    const r = validateLeavesAgainstMarketSpec(getMarketSpec('us-estar')!, [m]);
    expect(r.findings.find((f) => f.rule === 'ACCEPTED_FILE_TYPES')?.message).toMatch(/not a PDF/);
  });

  it('secured PDF bytes under a non-.pdf name are still judged', async () => {
    const m = await measureLeafFile({ fileName: 'report.docx', fileFormat: 'DOCX', bytes: securedPdf }, 'us');
    expect(m.measured?.security).toBe('secured');
    expect(validateLeavesAgainstMarketSpec(usEctd, [m]).findings.some((f) => f.rule === 'PDF_NO_SECURITY')).toBe(true);
  });

  it('a measured non-PDF leaf (neither name nor header) is judged, not left unassessed', async () => {
    const m = await measureLeafFile({ fileName: 'data.docx', filePath: 'm1/us/data.docx', fileFormat: 'DOCX', bytes: zipBytes }, 'us');
    expect(m.measured).toMatchObject({ isPdf: false, security: null });
    const r = validateLeavesAgainstMarketSpec(usEctd, [m]);
    expect(r.notAssessed).toEqual([]);
    expect(r.findings.map((f) => f.rule)).toEqual(['ACCEPTED_FILE_TYPES']);
  });

  it('the packager and the transmit guard use the shared predicate, not an inline copy', () => {
    for (const rel of [
      '../../submission-gateways/regional-packager.ts',
      '../../submission-gateways/bundle-leaf-security.ts',
      '../market-formatting-validator.ts',
    ]) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(src, rel).toMatch(/import \{[^}]*\bisPdfLeaf\b[^}]*\} from '\.\.\/ectd\/pdfa-detect'/);
      expect(src, rel).toMatch(/\bisPdfLeaf\([^)]*,/);
      // The copies this replaced: `named || hasPdfHeader(..)`, `!named && !hasPdfHeader(..)`, header-only `if (isPdf)`.
      expect(src, rel).not.toMatch(/\|\|\s*hasPdfHeader\(|!hasPdfHeader\(|if \(isPdf\)|function isPdfLeaf\b/);
    }
  });
});

/*
 * 2026-09-23 (W5/D7, round-2 skeptic): the declared format is a claim about a
 * file whose name the agency reads. It narrowed the not-a-PDF check (a .pdf
 * declared 'DOCX' with non-PDF bytes was only a warning) and widened
 * acceptance (payload.exe declared 'PDF' was 'conformant'); and a type judged
 * from the declaration alone, with no byte read, counted as assessed.
 */
describe('the file name decides the type; the declared format is checked against it', () => {
  const usEstar = getMarketSpec('us-estar')!;
  const zipBytes = Buffer.from('PK\x03\x04' + 'x'.repeat(200), 'latin1');
  const typeFindings = (r: ReturnType<typeof validateLeavesAgainstMarketSpec>) =>
    r.findings.filter((f) => f.rule === 'ACCEPTED_FILE_TYPES');

  it('a .pdf whose bytes are not a PDF is an error whatever format is declared', async () => {
    for (const fileFormat of ['DOCX', 'XPT', undefined]) {
      const m = await measureLeafFile(
        { fileName: 'report.pdf', filePath: 'attachments/report.pdf', ...(fileFormat ? { fileFormat } : {}), bytes: zipBytes },
        'us',
      );
      const r = validateLeavesAgainstMarketSpec(usEstar, [m]);
      expect(r.verdict, String(fileFormat)).toBe('nonconformant');
      expect(typeFindings(r).some((f) => f.severity === 'error' && /not a PDF/.test(f.message)), String(fileFormat)).toBe(true);
    }
  });

  it('a file whose extension is not accepted is flagged even when declared as an accepted format', async () => {
    const m = await measureLeafFile({ fileName: 'payload.exe', filePath: 'attachments/payload.exe', fileFormat: 'PDF', bytes: plainPdf }, 'us');
    const r = validateLeavesAgainstMarketSpec(usEstar, [m]);
    expect(r.verdict).not.toBe('conformant');
    const found = typeFindings(r);
    expect(found.some((f) => /\(exe\) is not among the accepted formats/.test(f.message))).toBe(true);
    expect(found.some((f) => /declared PDF but its extension is \.exe/.test(f.message))).toBe(true);
  });

  it('a declared format that disagrees with an accepted extension is flagged', () => {
    const r = validateLeavesAgainstMarketSpec(usEctd, [{ fileName: 'x.pdf', fileFormat: 'XPT' }]);
    expect(typeFindings(r).map((f) => f.message)).toEqual([expect.stringMatching(/declared XPT but its extension is \.pdf/)]);
  });

  it('a declared format that agrees with the extension is not flagged', () => {
    const r = validateLeavesAgainstMarketSpec(usEstar, [{ fileName: 'x.pdf', fileFormat: 'PDF attachments' }]);
    expect(typeFindings(r)).toEqual([]);
    expect(r.notAssessed.some((n) => n.rule === 'ACCEPTED_FILE_TYPES')).toBe(false);
  });

  it('an unread file with no extension, judged only by its declared format, is not assessed for type', () => {
    const r = validateLeavesAgainstMarketSpec(usEstar, [{ fileName: 'payload', fileFormat: 'PDF' }]);
    expect(typeFindings(r)).toEqual([]);
    expect(r.notAssessed.find((n) => n.rule === 'ACCEPTED_FILE_TYPES')).toMatchObject({ leaves: ['payload'] });
    expect(r.verdict).toBe('not_assessed');
  });

  it('an unread file with no extension declared as a format that is not accepted is still reported', () => {
    const r = validateLeavesAgainstMarketSpec(usEstar, [{ fileName: 'payload', fileFormat: 'EXE' }]);
    expect(typeFindings(r)).toHaveLength(1);
  });

  it('a read file with no extension whose bytes are a PDF is judged', async () => {
    const m = await measureLeafFile({ fileName: 'payload', filePath: 'attachments/payload', fileFormat: 'PDF', bytes: plainPdf }, 'us');
    const r = validateLeavesAgainstMarketSpec(usEstar, [m]);
    expect(r.notAssessed.some((n) => n.rule === 'ACCEPTED_FILE_TYPES')).toBe(false);
    expect(typeFindings(r)).toEqual([]);
  });

  /* 2026-09-23 (W5/D7, round-2 skeptic, second pass): whatever followed the
     last dot was taken as the extension, so 'Cover letter v1.2' had the
     "extension" '2' and a real PDF declared PDF drew two warnings. A suffix is
     an extension only when it looks like one: 1–5 letters/digits with at least
     one letter, and no space. */
  it('a dotted name whose suffix is not an extension is judged by its declared format', async () => {
    const m = await measureLeafFile(
      { fileName: 'Cover letter v1.2', filePath: 'attachments/Cover letter v1.2', fileFormat: 'PDF', bytes: plainPdf },
      'us',
    );
    const r = validateLeavesAgainstMarketSpec(usEstar, [m]);
    expect(typeFindings(r)).toEqual([]);
    expect(r.verdict).toBe('conformant');
    const spaced = validateLeavesAgainstMarketSpec(usEstar, [{ fileName: 'Section 1.3.4 overview', fileFormat: 'EXE' }]);
    expect(typeFindings(spaced).map((f) => f.message)).toEqual([expect.stringMatching(/\(EXE\) is not among the accepted formats/)]);
  });

  /* 2026-09-23 (W5/D7, residual repair): the 1–5 character limit read a real
     longer extension as none — 'dm.sas7bdat' (a SAS dataset, which FDA does
     not accept in place of .xpt) and 'report.numbers' were judged by their
     declared format instead of the name the agency reads. */
  it('a real extension is still read: letters, digits, letter-digit mixes and longer extensions', () => {
    for (const [fileName, e] of [
      ['payload.exe', 'exe'], ['clip.mp4', 'mp4'], ['arc.7z', '7z'],
      ['dm.sas7bdat', 'sas7bdat'], ['report.numbers', 'numbers'],
    ] as const) {
      const r = validateLeavesAgainstMarketSpec(usEstar, [{ fileName, fileFormat: 'PDF' }]);
      expect(typeFindings(r).some((f) => f.message.includes(`extension is .${e}`)), fileName).toBe(true);
    }
  });
});
