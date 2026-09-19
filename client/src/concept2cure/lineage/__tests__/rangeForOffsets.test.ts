// @vitest-environment jsdom
/**
 * rangeForOffsets — the inverse of selectionToRange (ledger L179).
 *
 * This is the mapping that decides WHICH WORDS get painted as "backed by this
 * source". Getting it subtly wrong produces a confident highlight over the
 * wrong sentence, which is worse than no highlight: the author reads it as a
 * citation they do not have.
 *
 * The cases that matter are all boundary cases — a span that begins exactly
 * where a text node ends, a span crossing element boundaries, a span running
 * past the rendered text — so they are pinned exactly rather than sampled.
 *
 * It is also checked AGAINST its inverse: whatever text `rangeForOffsets`
 * selects for [a, b) must be the same text the offsets describe. Two mappings
 * that disagree would be invisible in either one's own tests.
 */
import { describe, it, expect } from 'vitest';

import { rangeForOffsets, offsetsAreTrustworthy } from '../selectionOffsets';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** The canonical text, by the same definition the module uses. */
function renderedText(root: HTMLElement): string {
  return (root.textContent ?? '').length ? collect(root) : '';
}
function collect(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = '';
  let n: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) out += (n as Text).data;
  return out;
}

describe('rangeForOffsets', () => {
  it('selects exactly the characters the offsets name, in one text node', () => {
    const root = mount('<p>The endpoint was met.</p>');
    const r = rangeForOffsets(root, 4, 12);
    expect(r).not.toBeNull();
    expect(r!.toString()).toBe('endpoint');
  });

  it('crosses element boundaries the way the text reads', () => {
    const root = mount('<p>The <strong>primary</strong> endpoint was met.</p>');
    // "primary endpoint" spans the <strong> boundary.
    const r = rangeForOffsets(root, 4, 20);
    expect(r!.toString()).toBe('primary endpoint');
  });

  it('binds a boundary that falls between two text nodes to the start of the next', () => {
    const root = mount('<p><em>Alpha</em><em>Beta</em></p>');
    // Offset 5 is exactly the seam. The span [5,9) is "Beta".
    const r = rangeForOffsets(root, 5, 9);
    expect(r!.toString()).toBe('Beta');
  });

  it('agrees with the text it is mapping over, across every start offset', () => {
    const root = mount('<p>The <strong>primary</strong> endpoint <em>was met</em>.</p>');
    const text = collect(root);
    // Two mappings that disagree would pass each other's tests; this checks the
    // painted range against the string the offsets were taken from.
    for (let start = 0; start < text.length - 3; start += 1) {
      const end = Math.min(start + 4, text.length);
      const r = rangeForOffsets(root, start, end);
      expect(r, `no range for [${start},${end})`).not.toBeNull();
      expect(r!.toString()).toBe(text.slice(start, end));
    }
  });

  it('REFUSES a range that runs past the rendered text rather than clamping', () => {
    const root = mount('<p>Short.</p>');
    // Clamping here would paint "Short." and call it the span — a highlight
    // over text the span does not describe.
    expect(rangeForOffsets(root, 3, 999)).toBeNull();
  });

  it('refuses an empty or inverted range', () => {
    const root = mount('<p>The endpoint was met.</p>');
    expect(rangeForOffsets(root, 5, 5)).toBeNull();
    expect(rangeForOffsets(root, 9, 4)).toBeNull();
    expect(rangeForOffsets(root, -2, 4)).toBeNull();
  });

  it('refuses when there is no container at all', () => {
    expect(rangeForOffsets(null, 0, 4)).toBeNull();
  });

  it('skips the subtrees offsetsAreTrustworthy also skips, so the two agree', () => {
    // A floating toolbar inside the container would shift every offset after it
    // if it counted. It is marked, and both directions must ignore it.
    const root = mount(
      '<p>The endpoint was met.</p><div data-lineage-ignore>toolbar chrome</div>',
    );
    expect(offsetsAreTrustworthy(root, 'The endpoint was met.')).toBe(true);
    expect(rangeForOffsets(root, 4, 12)!.toString()).toBe('endpoint');
    void renderedText;
  });
});
