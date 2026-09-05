// @vitest-environment jsdom
/**
 * Citations in the canvas: what the editor stores, and what number it shows.
 *
 * ── The two things the editor must not get wrong ────────────────────────────
 * 1. WHAT IT STORES. A citation stores the source's id and the author's
 *    pinpoint. If the serialized HTML ever carried the number instead, the
 *    whole feature would be the defect it replaces — a stale ordinal frozen
 *    into a governed record, wrong the moment anything is inserted above it.
 * 2. WHAT IT SHOWS. The number is derived from position, and the editor holds
 *    ONE section while the reference list belongs to the DOCUMENT. A canvas
 *    that numbered from 1 in every section would show "[1]" for a claim the
 *    filing prints as "[7]" — the plausible-looking wrong number the design
 *    exists to remove.
 *
 * The round-trip fidelity gate is the third: a node that contributed no text
 * would push every section holding a citation into raw source mode, disabling
 * the editor the capability ships in. The cached NAME is what it contributes.
 */
import { describe, expect, it } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Node as PMNode, Schema } from '@tiptap/pm/model';
import { getSchema } from '@tiptap/core';
import {
  Citation,
  citationNumbers,
  citationOrderKey,
  citedSourceIdsInHtml,
} from '../citationNode';
import { citationLookupFor } from '@shared/authoring/citations';

const CSR = '41';
const PROTOCOL = '77';

const LIBRARY = citationLookupFor([
  { id: CSR, title: 'CTP-201 Clinical Study Report' },
  { id: PROTOCOL, title: 'CTP-201-301 Protocol' },
]);

const EXTENSIONS = [Document, Paragraph, Text, Citation];
const SCHEMA: Schema = getSchema(EXTENSIONS);

const STORED =
  `<p>Met<a data-cite="${CSR}" data-cite-locator="p. 142">CTP-201 Clinical Study Report</a>` +
  ` per<a data-cite="${PROTOCOL}">CTP-201-301 Protocol</a>.</p>`;

/** A ProseMirror doc from stored HTML, as the canvas holds it. */
const docOf = (html: string): PMNode =>
  PMNode.fromJSON(SCHEMA, generateJSON(html, EXTENSIONS));

describe('what the editor stores', () => {
  it('keeps the source id and the pinpoint, and no number at all', () => {
    const json = generateJSON(STORED, EXTENSIONS) as {
      content: { content: { type: string; attrs?: Record<string, unknown> }[] }[];
    };
    const cites = json.content[0].content.filter((n) => n.type === 'citation');

    expect(cites.map((n) => n.attrs?.source)).toEqual([CSR, PROTOCOL]);
    expect(cites[0].attrs?.locator).toBe('p. 142');
    // The number is nowhere in what the editor holds. It is a rendering.
    expect(JSON.stringify(cites)).not.toMatch(/\[\d+\]/);
  });

  it('round-trips through serialization without losing the identity', () => {
    const out = generateHTML(generateJSON(STORED, EXTENSIONS), EXTENSIONS);
    expect(out).toContain(`data-cite="${CSR}"`);
    expect(out).toContain('data-cite-locator="p. 142"');
    expect(out).toContain(`data-cite="${PROTOCOL}"`);
  });

  it('caches the source’s NAME as the element’s text, never the number', () => {
    /* The fidelity gate compares stored text against parsed text. A node with
       no text would drop every section holding a citation into source mode; a
       node caching the NUMBER would put an ordinal into the governed record
       that goes stale on the next insertion anywhere above it. */
    const json = generateJSON(STORED, EXTENSIONS) as {
      content: { content: { type: string; attrs?: Record<string, unknown> }[] }[];
    };
    const labels = json.content[0].content
      .filter((n) => n.type === 'citation')
      .map((n) => String(n.attrs?.label ?? ''));

    expect(labels).toEqual(['CTP-201 Clinical Study Report', 'CTP-201-301 Protocol']);
    // And that text survives serialization, which is what the gate reads.
    const out = generateHTML(generateJSON(STORED, EXTENSIONS), EXTENSIONS);
    expect(out).toContain('>CTP-201 Clinical Study Report</a>');
    expect(out).not.toMatch(/>\[\d+\]?</);
  });

  it('does not capture an ordinary link', () => {
    const json = generateJSON('<p>See <a href="https://example.org">guidance</a>.</p>', [
      ...EXTENSIONS,
    ]) as { content: { content: { type: string }[] }[] };
    expect(json.content[0].content.some((n) => n.type === 'citation')).toBe(false);
  });
});

describe('what the editor shows', () => {
  it('numbers by position in the document, not by position in the section', () => {
    const doc = docOf(STORED);

    // First section of the document: numbering starts at 1.
    expect(citationNumbers(doc, LIBRARY, [])).toEqual(
      new Map([
        [CSR, 1],
        [PROTOCOL, 2],
      ]),
    );

    /* The same section, now sitting below a section that already cited the
       protocol. Nothing about the stored content changed — the numbers did. */
    expect(citationNumbers(doc, LIBRARY, [PROTOCOL])).toEqual(
      new Map([
        [PROTOCOL, 1],
        [CSR, 2],
      ]),
    );
  });

  it('gives a source cited twice in one section ONE number', () => {
    const twice = docOf(
      `<p>a<a data-cite="${CSR}">x</a> b<a data-cite="${CSR}" data-cite-locator="p. 9">y</a></p>`,
    );
    expect(citationNumbers(twice, LIBRARY, [])).toEqual(new Map([[CSR, 1]]));
  });

  it('gives an unknown source NO number, so the list it points into has no gap', () => {
    const mixed = docOf(
      `<p>a<a data-cite="99999">gone</a> b<a data-cite="${CSR}">csr</a></p>`,
    );
    const numbers = citationNumbers(mixed, LIBRARY, []);
    expect(numbers.has('99999')).toBe(false);
    // The resolvable one still gets the first number — no hole is reserved.
    expect(numbers.get(CSR)).toBe(1);
  });

  it('numbers nothing when the library is unavailable, rather than guessing', () => {
    expect(citationNumbers(docOf(STORED), null, []).size).toBe(0);
  });

  it('changes its order key only when a citation moves, is added or is removed', () => {
    const base = citationOrderKey(docOf(STORED));
    // Editing the prose around the citations does not renumber anything.
    expect(citationOrderKey(docOf(STORED.replace('Met', 'The endpoint was met')))).toBe(base);
    // Adding one does.
    expect(
      citationOrderKey(docOf(STORED + `<p><a data-cite="${PROTOCOL}">p</a></p>`)),
    ).not.toBe(base);
  });
});

describe('reading the sections above this one', () => {
  it('lists the source ids a stored section cites, in reading order', () => {
    expect(citedSourceIdsInHtml(STORED)).toEqual([CSR, PROTOCOL]);
  });

  it('returns nothing for content with no citations, and for empty content', () => {
    expect(citedSourceIdsInHtml('<p>Plain prose.</p>')).toEqual([]);
    expect(citedSourceIdsInHtml('')).toEqual([]);
  });

  it('is not fooled by prose that merely looks like markup', () => {
    // Stored content is three generations of markup and prose can carry
    // tag-shaped tokens; only the parser is trustworthy here.
    expect(citedSourceIdsInHtml('<p>temperature &lt;data-cite&gt; threshold</p>')).toEqual([]);
  });
});
