/**
 * @vitest-environment jsdom
 *
 * @fileoverview DOM selection → character offsets.
 *
 * This mapping is the join between what a reader points at and what the lineage
 * table recorded. If it is off by one, the panel confidently reports the
 * provenance of adjacent words — which is worse than reporting nothing, because
 * it is believed. So the assertions here are about exactness across the cases
 * that actually break naive implementations: text split over several elements,
 * nested markup, boundaries landing on element nodes rather than text nodes,
 * and content the document should not count.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { offsetsAreTrustworthy, selectionToRange } from '../selectionOffsets';

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  host.remove();
});

/** Select from (startNode, startOffset) to (endNode, endOffset). */
function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

describe('selectionToRange — offsets are absolute within the container', () => {
  it('maps a selection inside a single text node', () => {
    host.innerHTML = 'The primary endpoint was met.';
    const t = host.firstChild as Text;
    select(t, 4, t, 11); // "primary"

    expect(selectionToRange(host)).toEqual({ charStart: 4, charEnd: 11, text: 'primary' });
  });

  it('accumulates across sibling elements', () => {
    // The case that breaks anchorOffset: the selection starts in the second
    // element, whose local offset 0 is character 6 of the document.
    host.innerHTML = '<span>alpha </span><span>bravo</span>';
    const second = host.children[1].firstChild as Text;
    select(second, 0, second, 5);

    expect(selectionToRange(host)).toMatchObject({ charStart: 6, charEnd: 11, text: 'bravo' });
  });

  it('accumulates through nested markup', () => {
    host.innerHTML = 'one <b>two <i>three</i></b> four';
    const deep = host.querySelector('i')!.firstChild as Text;
    select(deep, 0, deep, 5); // "three" begins at 8

    expect(selectionToRange(host)).toMatchObject({ charStart: 8, charEnd: 13, text: 'three' });
  });

  it('spans across element boundaries', () => {
    host.innerHTML = '<p>first part</p><p>second part</p>';
    const a = host.children[0].firstChild as Text;
    const b = host.children[1].firstChild as Text;
    select(a, 6, b, 6); // "part" + "second"

    const r = selectionToRange(host)!;
    expect(r.charStart).toBe(6);
    expect(r.charEnd).toBe(16); // 10 chars in the first p, + 6
  });

  it('handles a boundary that lands on an element rather than a text node', () => {
    // Browsers do this when a selection is extended to the end of a container.
    host.innerHTML = '<span>alpha</span><span>bravo</span>';
    select(host, 0, host, 1); // the whole first span, addressed by child index

    expect(selectionToRange(host)).toMatchObject({ charStart: 0, charEnd: 5 });
  });

  it('ignores subtrees marked as not part of the document text', () => {
    // A toolbar rendered inside the container would otherwise shift every
    // offset after it.
    host.innerHTML =
      '<div data-lineage-ignore>TOOLBAR</div><span>alpha bravo</span>';
    const t = host.querySelector('span')!.firstChild as Text;
    select(t, 6, t, 11); // "bravo"

    expect(selectionToRange(host)).toMatchObject({ charStart: 6, charEnd: 11, text: 'bravo' });
  });
});

describe('selectionToRange — refuses rather than guesses', () => {
  it('returns null with no selection', () => {
    host.innerHTML = 'text';
    expect(selectionToRange(host)).toBeNull();
  });

  it('returns null for a collapsed selection (a plain click)', () => {
    host.innerHTML = 'some text';
    const t = host.firstChild as Text;
    select(t, 3, t, 3);
    expect(selectionToRange(host)).toBeNull();
  });

  it('returns null when the selection is outside the container', () => {
    host.innerHTML = 'inside';
    const outside = document.createElement('p');
    outside.textContent = 'elsewhere';
    document.body.appendChild(outside);
    const t = outside.firstChild as Text;
    select(t, 0, t, 4);

    expect(selectionToRange(host)).toBeNull();
    outside.remove();
  });

  it('returns null for a null container', () => {
    expect(selectionToRange(null)).toBeNull();
  });
});

describe('offsetsAreTrustworthy — the drift guard', () => {
  it('is true when the rendered text matches what lineage was recorded against', () => {
    host.innerHTML = '<span>alpha </span><span>bravo</span>';
    expect(offsetsAreTrustworthy(host, 'alpha bravo')).toBe(true);
  });

  it('is false when the rendering has drifted from the canonical text', () => {
    // Markdown rendered to HTML, whitespace collapsed, a heading marker dropped
    // — any of these make offsets mean something else. Better to say so.
    host.innerHTML = '<h1>Title</h1><p>body</p>';
    expect(offsetsAreTrustworthy(host, '# Title\n\nbody')).toBe(false);
  });

  it('does not count ignored subtrees toward the comparison', () => {
    host.innerHTML = '<div data-lineage-ignore>chrome</div><span>alpha bravo</span>';
    expect(offsetsAreTrustworthy(host, 'alpha bravo')).toBe(true);
  });

  it('is false for a null container', () => {
    expect(offsetsAreTrustworthy(null, 'anything')).toBe(false);
  });
});
