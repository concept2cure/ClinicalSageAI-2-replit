/**
 * get_document_template pages every outline the library serves to its last
 * heading, on the call AnA makes by default (3a review, 2026-10-25).
 *
 * A registry_id turns on the preparation brief. The tool pages by top-level
 * section, so once the Clinical Summary was read from the record, its 2.7.4
 * subtree plus the brief was over the response budget. The default call then
 * failed at 2.7.4 and never returned 2.7.4–2.7.6. The open-document brief sends
 * AnA into exactly that call ("call get_document_template with registry_id …").
 */
import { describe, expect, it } from 'vitest';
import { documentTemplateTool } from '../document-template-tool';
import { getRegistryDocumentTemplate, registryDocumentTemplateCoverage, type TemplateSection } from '../../market-specs/document-template-library';

const every = (s: TemplateSection[]): TemplateSection[] => s.flatMap((x) => [x, ...every(x.subsections ?? [])]);
const nodes = (s: TemplateSection[]) => every(s).map((x) => x.number);

let prepared = 0;
async function pageAll(input: Record<string, unknown>): Promise<string[]> {
  const got: string[] = [];
  prepared = 0;
  let offset = 0;
  for (let page = 0; page < 60; page++) {
    const raw = await documentTemplateTool({ ...input, offset, limit: 30 });
    expect(raw.length, `${JSON.stringify(input)} @${offset}`).toBeLessThanOrEqual(7800);
    const out = JSON.parse(raw);
    expect(out.error, `${JSON.stringify(input)} @${offset}`).toBeUndefined();
    if (out.preparation) prepared += 1;
    got.push(...nodes(out.template.sections));
    if (out.nextOffset === null) {
      // The brief, asked for, is on exactly one page: never lost, never repeated.
      if (input.prepare !== false) expect(prepared, JSON.stringify(input)).toBe(1);
      return got;
    }
    offset = out.nextOffset;
  }
  throw new Error(`${JSON.stringify(input)}: paging did not end`);
}

describe('every served outline pages to its last heading with the default preparation', () => {
  it('each registry outline, by registry_id (prepare on by default), returns every node and no error', async () => {
    const rows = (await registryDocumentTemplateCoverage()).filter((r) => r.outlineAvailable);
    expect(rows.length).toBeGreaterThan(50);
    const failed: string[] = [];
    for (const r of rows) {
      const t = await getRegistryDocumentTemplate(r.registryId);
      const want = nodes([...(t?.frontMatter ?? []), ...(t?.sections ?? [])]).filter((n) => !(t?.frontMatter ?? []).some((f) => f.number === n));
      try {
        // This tool serves US, EU, Canada, Japan and the harmonised (GLOBAL) filings, and refuses any
        // other region by name, prepare or not (document-template-tool.ts: "never exact identity or market
        // validation"). Such a refusal is that policy, never the response budget.
        const first = JSON.parse(await documentTemplateTool({ registry_id: r.registryId }));
        if (typeof first.error === 'string' && /preparation plan covers US, EU, Canada and Japan/.test(first.error)) {
          expect(['US', 'EU', 'CA', 'JP', 'GLOBAL'], r.registryId).not.toContain(r.region);
          continue;
        }
        expect(await pageAll({ registry_id: r.registryId })).toEqual(want);
      } catch (e) {
        failed.push(`${r.registryId}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
    expect(failed).toEqual([]);
  });

  it('the Clinical Summary reaches 2.7.4–2.7.6 with a market set', async () => {
    for (const market of ['US', 'EU', 'JP']) {
      const got = await pageAll({ template_id: 'clinical_summary', market });
      for (const c of ['2.7.4', '2.7.4.2.1.5', '2.7.5', '2.7.6']) expect(got, market).toContain(c);
    }
  });
});
