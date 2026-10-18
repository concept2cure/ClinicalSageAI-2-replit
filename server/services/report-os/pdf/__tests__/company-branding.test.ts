import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import type { CompanyDocumentProfile } from '../../../../../shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../../shared/templates/template-spec';
import { buildRunPdf, type RunPdfInput } from '../run-pdf';
import { buildBundlePdf, buildReportPackPdf } from '../bundle-pdf';

function company(): CompanyDocumentProfile {
  const letterhead = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_SPEC)) as typeof DEFAULT_TEMPLATE_SPEC;
  letterhead.header = { text: 'Regulatory Affairs', alignment: 'left', showLogo: true };
  letterhead.footer = { text: 'Company correspondence - retained original content', showPageNumbers: true, pageNumberFormat: 'Company page {PAGE}/{PAGES}' };
  const canvas = createCanvas(8, 4);
  canvas.getContext('2d').fillRect(0, 0, 8, 4);
  letterhead.brand.logo = { mimeType: 'image/png', dataBase64: canvas.toBuffer('image/png').toString('base64'), placement: 'header' };
  return { version: 1, revision: 9, companyName: 'Sponsor Pharma 日本語', address: '12 Research Avenue', contact: 'regulatory@sponsor.example',
    registrationDetails: 'Company registration 12345', letterhead, importedFrom: null, applyToReports: true,
    applyToSubmissionCorrespondence: false, legalDocuments: [] };
}
function run(): RunPdfInput {
  return { run: { id: 41, runUuid: 'run-41', reportTypeId: 'fixture.report', scopeType: 'project', scopeId: '12', status: 'partial', confidence: null, createdAt: null },
    typeLabel: 'Recorded report', report: { reportTypeId: 'fixture.report', scopeType: 'project', scopeId: '12', status: 'partial', generatedAt: '2026-10-01T08:00:00Z',
      sections: [{ id: 'body', title: 'Recorded section', blocks: [{ kind: 'summary', text: 'Retained content - ORIGINAL-REPORT-BODY' }] }] },
    seal: null, runBy: 'Sam Lee', exportId: 'exp-company', exportedAt: '2026-10-01T10:00:00.000Z' };
}
const bundle = { bundle: { bundleId: 'company-bundle-41', name: 'Sponsor pack', createdAt: null }, bundledBy: 'Sam Lee', exportId: 'exp-company', exportedAt: '2026-10-01T10:00:00.000Z' };
async function read(bytes: Buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return { text: result.text.replace(/\s+/g, ' '), pages: result.pages.map(page => page.text.replace(/\s+/g, ' ')) };
  } finally { await parser.destroy(); }
}

describe('company presentation on canonical governed report PDFs', () => {
  it('does not change any bytes when the company report preference is disabled', async () => {
    const profile = company(); profile.applyToReports = false;
    expect((await buildRunPdf({ ...run(), companyBranding: profile })).bytes).toEqual((await buildRunPdf(run())).bytes);
    expect((await read((await buildRunPdf(run())).bytes)).text).not.toContain('Sponsor Pharma');
  });

  it('renders saved identity, raster logo, header/footer and actual geometry on every overflow page without losing draft/export identity', async () => {
    const profile = company(); profile.letterhead.page = { size: 'a4', orientation: 'landscape', marginsInches: { top: .5, bottom: .5, left: .5, right: .5 } };
    const input = run();
    input.report.sections[0].blocks = [{ kind: 'blocker-list', items: Array.from({ length: 70 }, (_, i) => `Retained content line ${i + 1}`) }];
    const out = await buildRunPdf({ ...input, companyBranding: profile });
    const pdf = await read(out.bytes);
    expect(pdf.pages.length).toBeGreaterThan(1);
    for (let i = 0; i < pdf.pages.length; i += 1) {
      for (const text of ['Sponsor Pharma 日本語', '12 Research Avenue', 'regulatory@sponsor.example', 'Company registration 12345', 'Regulatory Affairs',
        'CONFIDENTIAL', 'Company correspondence - retained original content', 'NOT FINAL (PARTIAL)', 'Export exp-company']) expect(pdf.pages[i]).toContain(text);
      expect(pdf.pages[i]).toContain(`Company page ${i + 1}/${out.pages}`);
      expect(pdf.pages[i]).toContain(`Page ${i + 1} of ${out.pages}`);
    }
    expect(pdf.text).toContain('Retained content line 70');
    const doc = await PDFDocument.load(out.bytes);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(841.89, 2);
    expect(doc.getPage(0).getHeight()).toBeCloseTo(595.28, 2);
    const images = doc.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(2); // One shared logo and its optional alpha mask, independent of page count.
  });

  it('preserves final sealed content, signer, reason and verification when adding company presentation', async () => {
    const input = run(); input.run.status = 'final'; input.report.status = 'final';
    input.seal = { runId: 41, sealed: true, seal: { algorithm: 'sha256', contentHash: 'a'.repeat(64), atomCount: 1, sealedAt: '2026-10-01T09:00:00Z' },
      finalizedAt: '2026-10-01T09:00:01Z', signature: { signerName: 'Dana Reyes', signedAt: '2026-10-01T09:00:01Z', meaning: 'approval' },
      finalization: { reason: 'Reviewed original retained content', priorStatus: 'completed', meaning: 'approval' }, verification: { verdict: 'intact', checks: [] } };
    const before = JSON.parse(JSON.stringify(input));
    const text = (await read((await buildRunPdf({ ...input, companyBranding: company() })).bytes)).text;
    for (const value of ['Sponsor Pharma', 'ORIGINAL-REPORT-BODY', 'Signed by Dana Reyes as approval', 'Reviewed original retained content', 'Seal: sha256 ' + 'a'.repeat(64), 'Seal verification at export: intact.']) expect(text).toContain(value);
    expect(text).not.toContain('NOT FINAL');
    expect(input).toEqual(before);
  });

  it('applies the same profile to bundle manifests and all retained packet pages', async () => {
    const companyBranding = company();
    const manifest = await buildBundlePdf({ ...bundle, companyBranding, items: [{ runId: 41, label: 'Recorded report', scopeType: 'project', scopeId: '12', bundledStatus: 'partial', currentStatus: 'partial', confidence: null }] });
    expect((await read(manifest.bytes)).text).toContain('Sponsor Pharma');
    const packet = await buildReportPackPdf({ ...bundle, companyBranding, items: [{ content: run(), bundledStatus: 'partial', sourceDocument: 'retained-run-render' }] });
    const pages = (await read(packet.bytes)).pages;
    expect(pages.length).toBe(2);
    for (const page of pages) expect(page).toContain('Sponsor Pharma');
    expect(pages[1]).toContain('ORIGINAL-REPORT-BODY');
    expect(pages[1]).toContain('NOT FINAL (PARTIAL)');
    expect(pages[1]).toContain('Run #41 · project 12');
    expect(packet.constituents[0]).toMatchObject({ runId: 41, firstPage: 2, lastPage: 2, sealHash: null });
  });

  it('refuses unreadable logos, unrenderable glyphs and geometry that would hide content instead of silently ignoring company defaults', async () => {
    const invalid = company(); invalid.letterhead.brand.logo!.dataBase64 = Buffer.from('<svg onload="bad"/>').toString('base64');
    const tooLarge = company(); tooLarge.letterhead.page.marginsInches = { top: 4, bottom: 4, left: 1, right: 1 };
    const tooNarrow = company(); tooNarrow.letterhead.page.marginsInches = { top: 1, bottom: 1, left: 4, right: 4 };
    for (const companyBranding of [invalid, tooLarge, tooNarrow]) {
      await expect(buildRunPdf({ ...run(), companyBranding })).rejects.toMatchObject({ status: 422, code: 'REPORT_PDF_BRANDING_INVALID', message: expect.stringContaining('Nothing was exported') });
    }
    const unsupported = company(); unsupported.companyName += String.fromCodePoint(0x10ffff);
    await expect(buildRunPdf({ ...run(), companyBranding: unsupported })).rejects.toMatchObject({ code: 'REPORT_PDF_GLYPH_UNSUPPORTED' });
  });
});
