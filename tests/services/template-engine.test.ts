/**
 * AnA document-formatting template engine — unit tests.
 *
 * Covers the pure, DB-free layer:
 *   • normalizeTemplateSpec — coercion / clamping / defaults
 *   • extractFromDocx        — OOXML → TemplateSpec (page, fonts, colours, logo, header)
 *   • templateSpecToDocxStyle / templateSpecToPdfOptions — unit conversions
 *   • imageSize / fitWithin  — intrinsic dimensions + aspect-preserving scale
 *   • templateSpecToHtml     — print-CSS from a spec
 *   • renderDocxWithTemplate — full round-trip: spec drives the real .docx output
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';

import {
  DEFAULT_TEMPLATE_SPEC,
  normalizeTemplateSpec,
} from '../../server/services/templates/templateSpec';
import { extractFromDocx } from '../../server/services/templates/templateExtractor';
import {
  templateSpecToDocxStyle,
  templateSpecToPdfOptions,
  renderDocxWithTemplate,
} from '../../server/services/templates/templateRenderAdapter';
import { templateSpecToHtml } from '../../server/services/templates/templateHtml';
import { imageSize, fitWithin } from '../../server/services/templates/imageSize';

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function buildDocxFixture(): Buffer {
  const documentXml = `<?xml version="1.0"?>
<w:document ${W_NS}><w:body>
  <w:p><w:r><w:t>Body text</w:t></w:r></w:p>
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar w:top="2160" w:right="1440" w:bottom="2160" w:left="2880" w:header="720" w:footer="720"/>
  </w:sectPr>
</w:body></w:document>`;

  const stylesXml = `<?xml version="1.0"?>
<w:styles ${W_NS}>
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Georgia"/><w:sz w:val="28"/><w:color w:val="222222"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
    <w:rPr><w:rFonts w:ascii="Verdana"/><w:sz w:val="40"/><w:b/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
    <w:rPr><w:rFonts w:ascii="Verdana"/><w:sz w:val="32"/></w:rPr>
  </w:style>
</w:styles>`;

  const headerXml = `<?xml version="1.0"?>
<w:hdr ${W_NS}><w:p><w:r><w:drawing/></w:r><w:r><w:t>Acme Corp</w:t></w:r></w:p></w:hdr>`;

  const footerXml = `<?xml version="1.0"?>
<w:ftr ${W_NS}><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r></w:p></w:ftr>`;

  const zip = new AdmZip();
  zip.addFile('word/document.xml', Buffer.from(documentXml));
  zip.addFile('word/styles.xml', Buffer.from(stylesXml));
  zip.addFile('word/header1.xml', Buffer.from(headerXml));
  zip.addFile('word/footer1.xml', Buffer.from(footerXml));
  zip.addFile('word/media/image1.png', PNG_1x1);
  return zip.toBuffer();
}

describe('normalizeTemplateSpec', () => {
  it('returns a complete default spec from empty input', () => {
    const spec = normalizeTemplateSpec({});
    expect(spec).toEqual(DEFAULT_TEMPLATE_SPEC);
  });

  it('strips a leading # and uppercases hex colours', () => {
    const spec = normalizeTemplateSpec({ colors: { text: '#ab12cd' } });
    expect(spec.colors.text).toBe('AB12CD');
  });

  it('falls back to the default colour for an invalid hex', () => {
    const spec = normalizeTemplateSpec({ colors: { text: 'not-a-color' } });
    expect(spec.colors.text).toBe(DEFAULT_TEMPLATE_SPEC.colors.text);
  });

  it('clamps out-of-range margins and font sizes', () => {
    const spec = normalizeTemplateSpec({
      page: { marginsInches: { top: 99, bottom: -5 } },
      typography: { bodySizePt: 999 },
    });
    expect(spec.page.marginsInches.top).toBe(4);
    expect(spec.page.marginsInches.bottom).toBe(0);
    expect(spec.typography.bodySizePt).toBe(72);
  });

  it('drops a logo with no image data', () => {
    const spec = normalizeTemplateSpec({ brand: { logo: { mimeType: 'image/png' } } });
    expect(spec.brand.logo).toBeUndefined();
  });
});

describe('extractFromDocx', () => {
  const result = extractFromDocx(buildDocxFixture(), 'acme-form.docx');

  it('recovers page size and orientation', () => {
    expect(result.spec.page.size).toBe('letter');
    expect(result.spec.page.orientation).toBe('portrait');
  });

  it('converts margins from twips to inches', () => {
    expect(result.spec.page.marginsInches.top).toBe(1.5);
    expect(result.spec.page.marginsInches.bottom).toBe(1.5);
    expect(result.spec.page.marginsInches.left).toBe(2);
    expect(result.spec.page.marginsInches.right).toBe(1);
  });

  it('recovers body + heading fonts and sizes from styles.xml', () => {
    expect(result.spec.typography.bodyFont).toBe('Georgia');
    expect(result.spec.typography.bodySizePt).toBe(14); // 28 half-points
    expect(result.spec.typography.headingFont).toBe('Verdana');
    expect(result.spec.typography.heading1SizePt).toBe(20); // 40 half-points
  });

  it('recovers the default text colour', () => {
    expect(result.spec.colors.text).toBe('222222');
  });

  it('recovers the running-header text and detects its logo', () => {
    expect(result.spec.header?.text).toBe('Acme Corp');
    expect(result.spec.header?.showLogo).toBe(true);
  });

  it('detects page numbers in the footer', () => {
    expect(result.spec.footer?.showPageNumbers).toBe(true);
  });

  it('extracts the embedded logo and places it in the header', () => {
    expect(result.spec.brand.logo).toBeDefined();
    expect(result.spec.brand.logo?.mimeType).toBe('image/png');
    expect(result.spec.brand.logo?.placement).toBe('header');
  });

  it('reports high confidence and no blocking warnings', () => {
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.source.kind).toBe('docx');
  });

  it('degrades gracefully on a non-docx buffer', () => {
    const bad = extractFromDocx(Buffer.from('this is not a zip'), 'x.docx');
    expect(bad.confidence).toBe(0);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
});

describe('templateSpecToDocxStyle', () => {
  it('converts inches → twips and points → half-points', () => {
    const style = templateSpecToDocxStyle(
      normalizeTemplateSpec({
        page: { marginsInches: { top: 1, bottom: 1, left: 1, right: 1 } },
        typography: { bodySizePt: 11, lineSpacing: 1.5, paragraphSpaceAfterPt: 10 },
      }),
    );
    expect(style.margins.top).toBe(1440);
    expect(style.fontSizes.body).toBe(22); // 11pt × 2
    expect(style.lineSpacing).toBe(360); // 1.5 × 240
    expect(style.paragraphSpaceAfter).toBe(200); // 10pt × 20
  });
});

describe('templateSpecToPdfOptions', () => {
  it('maps serif/sans/mono families to the standard PDF fonts', () => {
    expect(templateSpecToPdfOptions(normalizeTemplateSpec({ typography: { bodyFont: 'Times New Roman' } })).fontFamily).toBe('Times-Roman');
    expect(templateSpecToPdfOptions(normalizeTemplateSpec({ typography: { bodyFont: 'Calibri' } })).fontFamily).toBe('Helvetica');
    expect(templateSpecToPdfOptions(normalizeTemplateSpec({ typography: { bodyFont: 'Courier New' } })).fontFamily).toBe('Courier');
  });

  it('converts margins to points and falls back legal → letter', () => {
    const opts = templateSpecToPdfOptions(
      normalizeTemplateSpec({ page: { size: 'legal', marginsInches: { top: 1, bottom: 1, left: 1, right: 1 } } }),
    );
    expect(opts.pageSize).toBe('letter');
    expect(opts.margins.top).toBe(72);
  });
});

describe('imageSize / fitWithin', () => {
  it('reads PNG dimensions', () => {
    expect(imageSize(PNG_1x1)).toEqual({ width: 1, height: 1 });
  });

  it('returns null for unknown formats', () => {
    expect(imageSize(Buffer.from('not an image at all really'))).toBeNull();
  });

  it('scales down preserving aspect ratio and never upscales', () => {
    expect(fitWithin(400, 200, 100, 100)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(10, 10, 100, 100)).toEqual({ width: 10, height: 10 });
  });
});

describe('templateSpecToHtml', () => {
  const doc = {
    metadata: { title: 'Annual Report', submissionType: 'IND' },
    sections: [{ title: 'Intro', paragraphs: ['Hello world'], bulletItems: ['a', 'b'] }],
  };

  it('emits @page margins and the body font from the spec', () => {
    const spec = normalizeTemplateSpec({
      page: { marginsInches: { top: 1.25, bottom: 1, left: 1, right: 1 } },
      typography: { bodyFont: 'Georgia' },
    });
    const html = templateSpecToHtml(spec, doc);
    expect(html).toContain('margin: 1.25in 1in 1in 1in');
    expect(html).toContain('"Georgia"');
    expect(html).toContain('Annual Report');
  });

  it('embeds the logo as a data URI when present', () => {
    const spec = normalizeTemplateSpec({
      brand: { logo: { dataBase64: PNG_1x1.toString('base64'), mimeType: 'image/png', placement: 'cover' } },
    });
    const html = templateSpecToHtml(spec, doc);
    expect(html).toContain('data:image/png;base64,');
  });

  it('escapes HTML in document content', () => {
    const html = templateSpecToHtml(normalizeTemplateSpec({}), {
      metadata: { title: '<script>x</script>', submissionType: 'IND' },
      sections: [],
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderDocxWithTemplate (round-trip)', () => {
  it('produces a .docx whose margins and fonts come from the spec', async () => {
    const spec = normalizeTemplateSpec({
      page: { marginsInches: { top: 1.5, bottom: 1.5, left: 2, right: 1 } },
      typography: { bodyFont: 'Georgia', headingFont: 'Verdana' },
    });
    const out = await renderDocxWithTemplate(spec, {
      metadata: { title: 'Spec-driven', submissionType: 'IND' },
      sections: [{ title: 'Section one', sectionCode: '1', paragraphs: ['Some body text.'] }],
    });

    expect(out.buffer.length).toBeGreaterThan(0);
    expect(out.filename).toMatch(/\.docx$/);

    const zip = new AdmZip(out.buffer);
    const documentXml = zip.readAsText(zip.getEntry('word/document.xml')!);
    // 1.5in × 1440 = 2160 twips top/bottom; 2in × 1440 = 2880 left.
    expect(documentXml).toContain('w:top="2160"');
    expect(documentXml).toContain('w:left="2880"');
    // The body + heading fonts from the spec are written onto the runs.
    expect(documentXml).toContain('Georgia');
    expect(documentXml).toContain('Verdana');
  });

  it('default style still renders the original regulatory look', async () => {
    const out = await renderDocxWithTemplate(DEFAULT_TEMPLATE_SPEC, {
      metadata: { title: 'Default look', submissionType: 'IND' },
      sections: [{ title: 'S', paragraphs: ['x'] }],
    });
    const zip = new AdmZip(out.buffer);
    const documentXml = zip.readAsText(zip.getEntry('word/document.xml')!);
    expect(documentXml).toContain('Times New Roman');
    // 1.25in left gutter = 1800 twips.
    expect(documentXml).toContain('w:left="1800"');
  });
});
