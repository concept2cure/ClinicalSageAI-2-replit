/**
 * validateEctdPackage — the validator the export route runs by default —
 * refuses a packaged file whose name breaks the eCTD file-name rule. It
 * checked index.xml, hrefs and DTDs, but never the names, so an over-long
 * leaf name left with a clean gate.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { validateEctdPackage } from '../ectd-structural-validator';

async function zipWith(leafName: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.xml', `<?xml version="1.0"?><ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink"><m1-administrative-information-and-prescribing-information><leaf xlink:href="m1/us/${leafName}" operation="new"/></m1-administrative-information-and-prescribing-information></ectd:ectd>`);
  zip.file(`m1/us/${leafName}`, '%PDF-1.4\n');
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('validateEctdPackage — file names', () => {
  it('reports a leaf name over 64 characters as an error', async () => {
    const longName = `${'cover-letter-'.repeat(5)}coauthor-documents-123456.pdf`;
    expect(longName.length).toBeGreaterThan(64);
    const result = await validateEctdPackage(await zipWith(longName));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(longName) && /file-name rule/.test(e))).toBe(true);
  });

  it('reports an uppercase or underscore name as an error', async () => {
    const result = await validateEctdPackage(await zipWith('Cover_Letter.pdf'));
    expect(result.errors.some((e) => e.includes('Cover_Letter.pdf') && /file-name rule/.test(e))).toBe(true);
  });

  it('raises no file-name error for a conformant name', async () => {
    const result = await validateEctdPackage(await zipWith('cover-letter-coauthor-documents-7.pdf'));
    expect(result.errors.some((e) => /file-name rule/.test(e))).toBe(false);
  });
});
