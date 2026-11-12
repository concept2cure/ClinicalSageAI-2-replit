// @vitest-environment jsdom
/**
 * A citation outside the editor reads as its number, as on the canvas and in
 * the filed document (2026-11-12).
 *
 * Walked in the running app: in the Document view a cited sentence read
 * "… C2C-101-biopharmaceutics-BP-001.txt", the source's file name cached in
 * the stored link, where the canvas showed "[1]". The Document view now hands
 * the renderer the document's numbering, made by the canvas's own walk.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AuthoredHtml, documentReadCitations } from '../AuthoredHtml';
import type { ProjectSourceRecord } from '../projectSourceCatalog';

const cite = (id: string, name: string, locator = '') =>
  `<a data-cite="${id}"${locator ? ` data-cite-locator="${locator}"` : ''}>${name}</a>`;
const source = (id: number, title: string): ProjectSourceRecord =>
  ({ id, title, extractionStatus: 'complete', isCurrent: true, dataEligible: true, originalFileAvailable: true });

const CATALOGUE = [source(11, 'BP-001 biopharmaceutics report'), source(12, 'PK-002 report'), source(13, 'Not admitted here')];
const SECTIONS = [
  { id: 's1', content: `<p>Absorption is rapid ${cite('12', 'PK-002.txt')} and complete ${cite('11', 'BP-001.txt', 'p. 4')}.</p>` },
  { id: 's2', content: `<p>Food has no effect ${cite('11', 'BP-001.txt')}; see also ${cite('13', 'other.txt')}.</p>` },
];
const ADMISSIONS = [
  { sectionId: 's1', sourceId: '12' }, { sectionId: 's1', sourceId: '11' }, { sectionId: 's2', sourceId: '11' },
];

afterEach(cleanup);

describe('documentReadCitations', () => {
  it('numbers sources in reading order across the document, once each, as the canvas does', () => {
    const read = documentReadCitations(SECTIONS, CATALOGUE, ADMISSIONS);
    const s1 = read.get('s1');
    const s2 = read.get('s2');
    expect(s1 !== 'checking' && [...(s1?.numbers ?? [])]).toEqual([['12', 1], ['11', 2]]);
    // §2 cites 11 again (same number) and 13, which is not admitted to it: no number.
    expect(s2 !== 'checking' && [...(s2?.numbers ?? [])]).toEqual([['11', 2]]);
  });
});

describe('AuthoredHtml with the document’s numbering', () => {
  it('prints the marker and the pinpoint, never the cached file name', () => {
    const read = documentReadCitations(SECTIONS, CATALOGUE, ADMISSIONS);
    const { container } = render(<AuthoredHtml html={SECTIONS[0].content} citations={read.get('s1')} />);
    expect(container.textContent).toBe('Absorption is rapid [1] and complete [2, p. 4].');
    expect(container.textContent).not.toMatch(/\.txt/);
    expect(container.querySelector('[data-cite="12"]')?.getAttribute('title')).toMatch(/^PK-002 report — numbered by its position/);
  });

  it('a source not admitted to the section is stated, and takes no number', () => {
    const read = documentReadCitations(SECTIONS, CATALOGUE, ADMISSIONS);
    const { container } = render(<AuthoredHtml html={SECTIONS[1].content} citations={read.get('s2')} />);
    expect(container.textContent).toMatch(/Food has no effect \[2\]; see also \[Citation unresolved/);
  });

  it('while the sources are being read it says so', () => {
    const { container } = render(<AuthoredHtml html={SECTIONS[0].content} citations="checking" />);
    expect(container.textContent).toBe('Absorption is rapid [Citation being checked] and complete [Citation being checked].');
  });

  it('control: without a numbering the stored text is shown as before', () => {
    const { container } = render(<AuthoredHtml html={SECTIONS[0].content} />);
    expect(container.textContent).toBe('Absorption is rapid PK-002.txt and complete BP-001.txt.');
  });
});
