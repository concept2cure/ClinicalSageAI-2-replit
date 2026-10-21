import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { generateRegulatory } from '../docxFactory';
import { renderDocxWithTemplate } from '../../templates/templateRenderAdapter';
import { normalizeTemplateSpec } from '../../../../shared/templates/template-spec';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const input = () => ({ metadata: { title: 'Agency correspondence', submissionType: 'Correspondence', sponsor: 'Sponsor Pharma', date: '2026-10-17' },
  includeCover: false, sections: [{ title: 'Agency correspondence', paragraphs: ['Customer-authored text & original wording.'] }] });
const xml = (zip: AdmZip, part: 'header' | 'footer') => zip.getEntries().filter(entry => /^word\/(header|footer)\d+\.xml$/.exec(entry.entryName)?.[1] === part)
  .map(entry => entry.getData().toString('utf8')).join('\n');

describe('canonical company letterhead DOCX presentation', () => {
  it.each([
    ['a4', 'landscape', 16838, 11906],
    ['legal', 'portrait', 12240, 20160],
    ['letter', 'portrait', 12240, 15840],
  ] as const)('writes actual %s %s page dimensions, orientation and saved margins', async (size, orientation, width, height) => {
    const spec = normalizeTemplateSpec({ page: { size, orientation, marginsInches: { top: .75, bottom: .5, left: 1.5, right: 1 } } });
    const doc = new AdmZip((await renderDocxWithTemplate(spec, input())).buffer).readAsText('word/document.xml');
    expect(doc).toContain(`w:w="${width}"`);
    expect(doc).toContain(`w:h="${height}"`);
    expect(doc).toContain(`w:orient="${orientation}"`);
    for (const [side, twips] of [['top', 1080], ['bottom', 720], ['left', 2160], ['right', 1440]]) expect(doc).toContain(`w:${side}="${twips}"`);
    expect(doc.match(/<w:sectPr\b/g)).toHaveLength(1);
    expect(doc).not.toContain('Sponsor:');
    expect(doc).not.toContain('Date:');
    expect(doc).toContain('Agency correspondence');
    expect(doc.match(/>Agency correspondence<\/w:t>/g)).toHaveLength(1);
    expect(doc).toContain('Customer-authored text &amp; original wording.');
  });

  it('embeds original raster bytes and renders saved identity, alignment, accent, footer and real Word page fields', async () => {
    const spec = normalizeTemplateSpec({ brand: { organizationName: 'Sponsor Pharma', confidentialityNotice: 'CONFIDENTIAL COMPANY DRAFT',
      logo: { mimeType: 'image/png', dataBase64: PNG.toString('base64'), placement: 'header' } },
      header: { text: '12 Research Avenue\nregulatory@sponsor.example\nCompany registration 12345', alignment: 'center', showLogo: true },
      footer: { text: 'Sponsor retained correspondence', showPageNumbers: true, pageNumberFormat: 'Company sheet {PAGE}/{PAGES}' }, colors: { accent: '123ABC' } });
    const before = JSON.parse(JSON.stringify(spec));
    const out = await renderDocxWithTemplate(spec, input());
    const zip = new AdmZip(out.buffer);
    const header = xml(zip, 'header');
    const footer = xml(zip, 'footer');
    for (const text of ['Sponsor Pharma', '12 Research Avenue', 'regulatory@sponsor.example', 'Company registration 12345']) expect(header).toContain(text);
    expect(header).toContain('w:jc w:val="center"');
    expect(header).toContain('w:color="123ABC"');
    expect(header).toContain('<w:pBdr>');
    expect(header).toContain('<w:drawing>');
    const images = zip.getEntries().filter(entry => entry.entryName.startsWith('word/media/') && entry.entryName.endsWith('.png'));
    expect(images).toHaveLength(1);
    expect(images[0].getData()).toEqual(PNG);
    for (const text of ['CONFIDENTIAL COMPANY DRAFT', 'Sponsor retained correspondence', 'Company sheet ', 'PAGE', 'NUMPAGES']) expect(footer).toContain(text);
    expect(footer).not.toContain('{PAGE}');
    expect(footer).not.toContain('{PAGES}');
    expect(out.source).toEqual(input());
    expect(spec).toEqual(before);
  });

  it('respects the running-logo and company page-number toggles', async () => {
    const spec = normalizeTemplateSpec({ brand: { logo: { mimeType: 'image/png', dataBase64: PNG.toString('base64'), placement: 'header' } },
      header: { showLogo: false, alignment: 'left', text: 'Left aligned header' }, footer: { showPageNumbers: false, text: 'Retained footer' } });
    const zip = new AdmZip((await renderDocxWithTemplate(spec, input())).buffer);
    expect(xml(zip, 'header')).toContain('w:jc w:val="left"');
    expect(xml(zip, 'header')).not.toContain('<w:drawing>');
    expect(xml(zip, 'footer')).toContain('Retained footer');
    expect(xml(zip, 'footer')).not.toContain('NUMPAGES');
  });

  it('preserves an explicitly cleared confidentiality notice through normalization and Word rendering', async () => {
    const spec = normalizeTemplateSpec({ brand: { confidentialityNotice: '  ' } });
    expect(spec.brand.confidentialityNotice).toBe('');
    expect(normalizeTemplateSpec({}).brand.confidentialityNotice).toContain('CONFIDENTIAL');
    const zip = new AdmZip((await renderDocxWithTemplate(spec, input())).buffer);
    expect(xml(zip, 'footer')).not.toContain('CONFIDENTIAL');
    expect(zip.readAsText('word/document.xml')).toContain('Customer-authored text &amp; original wording.');
  });

  it('keeps the original cover and default header alignment for existing factory callers', async () => {
    const { metadata, sections } = input();
    const zip = new AdmZip((await generateRegulatory({ metadata, sections })).buffer);
    const doc = zip.readAsText('word/document.xml');
    expect(doc.match(/<w:sectPr\b/g)).toHaveLength(2);
    expect(doc).toContain('Sponsor: Sponsor Pharma');
    expect(doc).toContain('Date: 2026-10-17');
    expect(xml(zip, 'header')).toContain('w:jc w:val="right"');
    expect(xml(zip, 'header')).not.toContain('<w:pBdr>');
  });
});
