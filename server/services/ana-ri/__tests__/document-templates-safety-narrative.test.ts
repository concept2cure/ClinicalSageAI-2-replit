/**
 * The chat safety-narrative template follows ICH E3 §12.3.2.
 *
 * Until 2026-10-05 the `safety_narrative` template AnA injects into chat was a
 * hand-kept outline: it never asked for post-mortem findings, countermeasures,
 * the sponsor's causality opinion or the duration of the disease being
 * treated (all items E3 §12.3.2 lists for a narrative), it forced the
 * investigator's causality onto a five-point scale ending in "definitely
 * related" that E3 does not prescribe and the study may not use, and its
 * detection pattern read /casual/ for "causal", so "causal assessment" never
 * reached it.
 *
 * The template now takes what a narrative carries from the E3 node itself
 * (server/services/ind/ctd/csr-e3-sections-results.ts, through
 * server/services/ind/ctd/index.ts), so this test reads the node rather than
 * restating it, and shows that a change to the node reaches the template and
 * that a missing node fails closed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDocumentTemplateBlock,
  detectDocumentTemplate,
  DOCUMENT_TEMPLATES,
} from '../document-templates';
import { getE3Section } from '../../ind/ctd/index.js';

const template = DOCUMENT_TEMPLATES.safety_narrative;
const block = () => buildDocumentTemplateBlock({ template, confidence: 1, matchedPatterns: [] });

describe('safety_narrative carries what ICH E3 §12.3.2 asks a narrative to carry', () => {
  const node = getE3Section('12.3.2')!;

  it('the E3 node exists and lists the narrative elements', () => {
    expect(node?.contains?.length).toBeGreaterThan(0);
  });

  it('every element the E3 §12.3.2 node lists is in the block AnA receives', () => {
    const text = block();
    for (const element of node.contains!) expect(text).toContain(element);
  });

  it.each([
    ['post-mortem findings', /post-mortem findings/],
    ['countermeasures', /countermeasures/],
    ["the sponsor's opinion on causality", /sponsor[’']s opinion on causality/],
    ['the disease being treated and its duration', /the disease being treated and its duration/],
  ])('names %s', (_label, re) => {
    expect(block()).toMatch(re);
  });

  it('carries the reviewer deficiencies the node records', () => {
    const text = block();
    for (const pitfall of node.pitfalls ?? []) expect(text).toContain(pitfall);
  });

  it('labels the E3 basis honestly (the node is recall until a verbatim check is filed)', () => {
    expect(block()).toMatch(/ICH E3 §12\.3\.2[^\n]*as recalled; verbatim check owed/);
  });
});

describe('causality: the investigator and the sponsor, in the study\'s own terms', () => {
  it('imposes no five-point scale ending in "definitely related"', () => {
    expect(block()).not.toMatch(/definitely related/i);
    for (const s of template.sections) expect(s.guidance).not.toMatch(/definitely related|probably related|unlikely related/i);
  });

  it('the causality section asks for the investigator\'s and the sponsor\'s assessments', () => {
    const causality = template.sections.find((s) => /causality/i.test(s.heading));
    expect(causality, 'a causality section').toBeTruthy();
    expect(causality!.guidance).toMatch(/investigator/i);
    expect(causality!.guidance).toMatch(/sponsor/i);
  });
});

describe('detection reads "causal", not "casual"', () => {
  it('"causal assessment" reaches the safety narrative template', () => {
    expect(detectDocumentTemplate('draft the causal assessment for this SAE')?.template.id).toBe('safety_narrative');
  });

  it('no detection pattern spells "casual"', () => {
    for (const p of template.detectionPatterns) expect(p.source).not.toMatch(/casual/);
  });
});

describe('the template derives from the node, and fails closed without it', () => {
  // The mocks replace the E3 data itself (the results-section rows), so what
  // they prove is the whole path: E3 row → E3 tree → template → prompt block.
  const RESULTS = '../../ind/ctd/csr-e3-sections-results.js';
  type Results = typeof import('../../ind/ctd/csr-e3-sections-results.js');

  afterEach(() => {
    vi.doUnmock(RESULTS);
    vi.resetModules();
  });

  async function blockWith(rows: (actual: Results['E3_RESULTS_SECTIONS']) => Results['E3_RESULTS_SECTIONS']): Promise<string> {
    vi.resetModules();
    vi.doMock(RESULTS, async (importOriginal) => {
      const actual = await importOriginal<Results>();
      return { ...actual, E3_RESULTS_SECTIONS: rows(actual.E3_RESULTS_SECTIONS) };
    });
    const mod = await import('../document-templates');
    const t = mod.DOCUMENT_TEMPLATES.safety_narrative;
    return mod.buildDocumentTemplateBlock({ template: t, confidence: 1, matchedPatterns: [] });
  }

  it('a change to the E3 node reaches the template', async () => {
    const text = await blockWith((rows) => rows.map((s) => (s.number === '12.3.2' ? { ...s, contains: ['SENTINEL-E3-ELEMENT'] } : s)));
    expect(text).toContain('SENTINEL-E3-ELEMENT');
  });

  it('a missing E3 node says the content is not encoded instead of inventing it', async () => {
    const text = await blockWith((rows) => rows.filter((s) => s.number !== '12.3.2'));
    expect(text).toMatch(/ICH E3 §12\.3\.2[^\n]*not encoded — do not supply from memory/);
  });
});
