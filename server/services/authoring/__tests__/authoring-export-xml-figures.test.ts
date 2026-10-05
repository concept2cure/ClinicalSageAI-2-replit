/**
 * The XML export files the same figures as the DOCX and PDF of one document
 * (work-orders item 18, 2026-10-05; the figure rule's refute-review, round 3:
 * O3; evidence docs/evidence/AUTHORING/2026-10-05-machine-draft-figures/).
 *
 * The XML wrote each section's stored HTML verbatim inside CDATA, so an older
 * section's external image URL or WebP payload appeared in the exported file,
 * though the DOCX and PDF refuse both and print "[Figure not exported: …]".
 */
import { describe, expect, it } from 'vitest';
import { renderAuthoringExport } from '../authoring-export';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const WEBP = `data:image/webp;base64,${'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='.repeat(4)}`;

async function xmlOf(content: string): Promise<string> {
  const out = await renderAuthoringExport({
    executor: { query: async () => ({ rows: [] }) } as never,
    tenantId: 7,
    doc: { id: 'd1', title: 'Doc', module: 'M2', status: 'draft', created_at: '2026-10-05' } as never,
    sections: [{ id: 's1', code: '2.5.1', title: 'Results', content, order_index: 0 } as never],
    format: 'xml',
    signatures: [],
  });
  return out.fileContent.toString('utf-8');
}

describe('the XML export carries only the figures the other formats file', () => {
  it('an external image URL is not in the file; its placeholder is', async () => {
    const xml = await xmlOf('<p>Results.</p><img src="https://collector.example/p.png?d=secret">');
    expect(xml).not.toContain('collector.example');
    expect(xml).toContain('[Figure not exported: ');
    expect(xml).toContain('<p>Results.</p>');
  });

  it('a WebP payload is not printed into the file', async () => {
    const xml = await xmlOf(`<p>Results.</p><img src="${WEBP}">`);
    expect(xml).not.toContain('UklGRhoAAABXRUJQ');
    expect(xml).toContain('[Figure not exported: ');
  });

  it('a figure is kept as written: a governed reference and an inline PNG', async () => {
    const xml = await xmlOf(`<p>A</p><img src="/api/authoring/images/file_1727500000000_k3v9qa"><img src="${PNG}" alt="Figure 1">`);
    expect(xml).toContain('/api/authoring/images/file_1727500000000_k3v9qa');
    expect(xml).toContain(PNG);
    expect(xml).not.toContain('[Figure not exported');
  });
});
