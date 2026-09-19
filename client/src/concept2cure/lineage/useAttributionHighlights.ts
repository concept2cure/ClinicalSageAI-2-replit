/**
 * Paint span lineage over the text an author is reading (ledger L179, Phase 6a).
 *
 * ── WHY THE CSS CUSTOM HIGHLIGHT API ─────────────────────────────────────────
 * The alternative is wrapping ranges in spans, which mutates a DOM ProseMirror
 * owns and rebuilds. That produces cursor jumps, lost selections and nodes that
 * leak into serialized output. `CSS.highlights` paints over Ranges and touches
 * nothing, which is the only way to decorate live editable text safely.
 *
 * ── WHEN IT REFUSES TO PAINT, AND WHY THAT IS THE POINT ──────────────────────
 * Offsets are recorded against the text as SAVED. The moment an author types,
 * every offset below the caret means something else, and a highlight drawn from
 * them sits over the wrong words — a confident, silent claim that a source backs
 * a sentence it does not.
 *
 * So painting is gated twice: the rendered text must still equal the text the
 * offsets describe (`offsetsAreTrustworthy`), and any span that cannot be
 * located exactly is dropped rather than approximated. The hook reports WHICH
 * of those happened, because a surface that simply stops painting looks
 * identical to a document with no attribution — and that is the reading an
 * author would act on.
 *
 * @module client/src/concept2cure/lineage/useAttributionHighlights
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { offsetsAreTrustworthy, rangeForOffsets } from './selectionOffsets';
import './attribution-highlights.css';

export interface AttributionSpan {
  charStart: number;
  charEnd: number;
  provenanceKind: string;
  usage: string;
  sourceTitle: string | null;
  stale: boolean;
}

export type HighlightState =
  /** Painted, with how many spans landed. */
  | { status: 'painted'; painted: number; dropped: number }
  /** The rendered text is no longer the text the offsets describe. */
  | { status: 'stale-text' }
  /** Nothing to paint. */
  | { status: 'empty' }
  /** This browser has no CSS Custom Highlight API. */
  | { status: 'unsupported' };

/** Highlight registry names, kept in one place so the CSS cannot drift. */
const REGISTRY = {
  source: 'attribution-source',
  author: 'attribution-author',
  machineAccepted: 'attribution-machine-accepted',
  machineUnaccepted: 'attribution-machine-unaccepted',
  stale: 'attribution-stale',
} as const;

function bucketFor(span: AttributionSpan): keyof typeof REGISTRY {
  if (span.provenanceKind === 'cre_evidence_source') return span.stale ? 'stale' : 'source';
  if (span.provenanceKind === 'machine_draft') return 'machineUnaccepted';
  if (span.provenanceKind === 'accepted_machine_draft') return 'machineAccepted';
  return 'author';
}

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

/** The API, or null where it does not exist (older browsers, jsdom). */
function registry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const HighlightCtor = (globalThis as { Highlight?: unknown }).Highlight;
  if (!css?.highlights || typeof HighlightCtor !== 'function') return null;
  return css.highlights;
}

function clearAll(reg: HighlightRegistry): void {
  for (const name of Object.values(REGISTRY)) reg.delete(name);
}

/**
 * @param root          the element rendering the document text
 * @param canonicalText the text the offsets were recorded against (what the
 *                      server last stored) — NOT the current buffer
 * @param spans         the projection from the attribution summary
 * @param enabled       false pauses painting without unmounting the hook
 */
export function useAttributionHighlights(
  root: HTMLElement | null,
  canonicalText: string | null | undefined,
  spans: AttributionSpan[] | null | undefined,
  enabled = true,
): HighlightState {
  const [state, setState] = useState<HighlightState>({ status: 'empty' });

  /* The effect must NOT depend on the spans array by reference. A caller
     passing an inline array — the obvious way to call this — gets a new
     reference every render, so the effect re-runs, sets state, re-renders, and
     builds another array: an infinite loop that presents as the tab locking up,
     not as an error. (Found exactly that way.)

     So it depends on a SIGNATURE of what would change the painting, and reads
     the spans themselves through a ref. Anything not in the signature cannot
     move a highlight: the source title is display text, and usage is not
     painted. */
  const signature = useMemo(
    () =>
      (spans ?? [])
        .map((sp) => `${sp.charStart}:${sp.charEnd}:${sp.provenanceKind}:${sp.stale ? 1 : 0}`)
        .join('|'),
    [spans],
  );
  const spansRef = useRef(spans);
  spansRef.current = spans;

  useEffect(() => {
    const reg = registry();
    if (!reg) {
      setState({ status: 'unsupported' });
      return;
    }

    clearAll(reg);

    const current = spansRef.current;
    if (!enabled || !root || !canonicalText || !current || current.length === 0) {
      setState({ status: 'empty' });
      return () => clearAll(reg);
    }

    if (!offsetsAreTrustworthy(root, canonicalText)) {
      // The author has edited, or this surface renders something other than the
      // stored text. Either way the offsets no longer point at these words.
      setState({ status: 'stale-text' });
      return () => clearAll(reg);
    }

    const byBucket = new Map<keyof typeof REGISTRY, Range[]>();
    let dropped = 0;
    for (const span of current) {
      const range = rangeForOffsets(root, span.charStart, span.charEnd);
      if (!range) {
        // Located inexactly is not located. Approximating here is the one thing
        // this whole module exists to avoid.
        dropped += 1;
        continue;
      }
      const bucket = bucketFor(span);
      const list = byBucket.get(bucket);
      if (list) list.push(range);
      else byBucket.set(bucket, [range]);
    }

    let painted = 0;
    const HighlightCtor = (globalThis as { Highlight: new (...r: Range[]) => unknown }).Highlight;
    for (const [bucket, ranges] of byBucket) {
      reg.set(REGISTRY[bucket], new HighlightCtor(...ranges));
      painted += ranges.length;
    }

    setState({ status: 'painted', painted, dropped });
    return () => clearAll(reg);
    // `signature` stands in for the spans; see the note above it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, canonicalText, signature, enabled]);

  return state;
}
