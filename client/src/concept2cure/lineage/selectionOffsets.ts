/**
 * Map a DOM selection onto character offsets in a document's canonical text.
 *
 * THE PROBLEM THIS SOLVES
 * Lineage is recorded against offsets in the document's plain text. The reader
 * selects in rendered HTML, where that text is split across elements, wrapped in
 * markup, and interleaved with nodes that render nothing a reader would count —
 * so `selection.anchorOffset` is an offset within one text node, not within the
 * document. Handing that number to the lineage API would return provenance for
 * the wrong passage while looking entirely plausible.
 *
 * The mapping walks the container's text nodes in document order, accumulating
 * length, so an offset is "characters of visible text before this point". That
 * matches how the text was stored, provided the container renders the same text
 * that was saved — which is the contract callers must hold up (see
 * `offsetsAreTrustworthy`).
 *
 * @module client/src/concept2cure/lineage/selectionOffsets
 */

export interface SelectionRange {
  charStart: number;
  charEnd: number;
  text: string;
}

/**
 * Text nodes under `root`, in document order, skipping subtrees that are not
 * part of the document's text — annotations, UI chrome, and anything the author
 * marked as non-content. Without the skip, a floating toolbar rendered inside
 * the container shifts every offset after it.
 */
function textNodesIn(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-lineage-ignore]')) return NodeFilter.FILTER_REJECT;
      // Elements that render no text a reader can select.
      if (parent.closest('script, style, template')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/** Characters of text before (node, offset) within root. */
function absoluteOffset(root: Node, node: Node, offsetInNode: number): number | null {
  if (!root.contains(node)) return null;

  if (node.nodeType === Node.TEXT_NODE) {
    let total = 0;
    for (const t of textNodesIn(root)) {
      if (t === node) return total + Math.min(offsetInNode, t.data.length);
      total += t.data.length;
    }
    return null;
  }

  // A selection boundary can land on an element, where offsetInNode counts
  // child NODES rather than characters — browsers produce this when a selection
  // is extended to the edge of a container. Resolve it by summing the text that
  // lies strictly before the boundary point, in document order.
  const children = node.childNodes;
  const atEnd = offsetInNode >= children.length;
  const ref = atEnd ? null : children[offsetInNode];

  let total = 0;
  for (const t of textNodesIn(root)) {
    const isBefore = ref
      ? // t precedes the child the boundary sits in front of. Text INSIDE that
        // child reports as contained, not preceding, so it correctly stops here.
        (ref.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
      : // Boundary at the end of the element: everything inside it, and
        // everything before it, precedes the boundary.
        node.contains(t) ||
        (node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;

    if (!isBefore) break; // document order, so nothing after this qualifies
    total += t.data.length;
  }
  return total;
}

/**
 * The current selection as offsets into `root`'s text, or null when there is no
 * usable selection (collapsed, outside the container, or spanning out of it).
 *
 * Returning null rather than a best guess is deliberate: a wrong range produces
 * a confident report about the wrong words, which is worse than no report.
 */
export function selectionToRange(root: HTMLElement | null): SelectionRange | null {
  if (!root) return null;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const start = absoluteOffset(root, range.startContainer, range.startOffset);
  const end = absoluteOffset(root, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;

  const charStart = Math.min(start, end);
  const charEnd = Math.max(start, end);
  if (charEnd <= charStart) return null;

  return { charStart, charEnd, text: sel.toString() };
}

/**
 * Whether offsets taken from `root` can be trusted against `canonicalText`.
 *
 * The mapping is only valid if the container renders the same text that was
 * stored. Callers that render markdown, collapse whitespace, or inject rendered
 * artefacts must pass the text they actually rendered. When this returns false
 * the UI should say it cannot locate the selection rather than query with
 * offsets that mean something else.
 */
export function offsetsAreTrustworthy(root: HTMLElement | null, canonicalText: string): boolean {
  if (!root) return false;
  const rendered = textNodesIn(root)
    .map((t) => t.data)
    .join('');
  return rendered === canonicalText;
}
