/**
 * How much of THIS document has a recorded origin — at a glance, while writing.
 *
 * Data Origins already answers "where did this sentence come from", but only for
 * a selection the author thought to make. An author had no way to see that a
 * section was half unattributed without selecting all of it, which means the
 * gap was only ever found by someone who already suspected it.
 *
 * ── WHAT THIS IS CAREFUL ABOUT ───────────────────────────────────────────────
 *
 * ATTRIBUTED IS NOT SOURCED. The headline is "has a recorded origin", never
 * "traces to a source". Most of a good regulatory document is the author's own
 * assertion; that IS attribution, and it is not a citation. Conflating the two
 * would flatter every document ever written from an author's head.
 *
 * NOTHING-ASSESSED IS NOT ZERO. An unloaded, loading, failed or unsupported
 * read each say so in words. A surface that renders any of them as 0% tells the
 * author their document is unattributed when the truth is that nobody looked —
 * and 0% is the reading they will act on.
 *
 * COLOUR IS NEVER THE SIGNAL. The bar is decorative and aria-hidden; every
 * figure it encodes is also a row of text in the legend, which is what a screen
 * reader gets. Segments additionally differ by texture, so the two that matter
 * most (unaccepted AI draft, and no recorded origin) are distinguishable
 * without colour vision.
 *
 * @module client/src/concept2cure/lineage/DocumentAttributionBar
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchDocumentAttribution,
  AttributionUnsupportedError,
  type DocumentAttributionSummary,
} from './dataOriginsApi';
import { INK, MUTED, RULE, OK, WARN } from './palette';

export interface DocumentAttributionBarProps {
  documentTable: string;
  documentId: string;
  /**
   * Bump to re-read after a save. The figure describes the text as the SERVER
   * last stored it, so re-reading on every keystroke would report the previous
   * save against the current draft — a number that is wrong in a way the author
   * cannot see.
   */
  refreshToken?: string | number;
  /** Open the fuller Data Origins view, when the host surface has one. */
  onOpenDetail?: () => void;
  /**
   * Handed the summary whenever one is read, so a host that also PAINTS the
   * spans (see useAttributionHighlights) can reuse this fetch instead of making
   * its own — two reads of the same thing can disagree, and the one the author
   * sees painted would not be the one the bar counted.
   *
   * Called with null when the read failed or was refused, so a host cannot keep
   * painting spans from a summary that no longer holds.
   */
  onSummary?: (summary: DocumentAttributionSummary | null) => void;
}

type Load =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: DocumentAttributionSummary };

/** A hatch, so a segment is still distinguishable without colour vision. */
const HATCH = (colour: string) =>
  `repeating-linear-gradient(45deg, ${colour}, ${colour} 3px, transparent 3px, transparent 6px)`;

interface Segment {
  key: keyof DocumentAttributionSummary['byKind'] | 'unattributed';
  label: string;
  /** What this category actually means, for the author who has not met it before. */
  hint: string;
  chars: number;
  fill: string;
  textured: boolean;
}

function segmentsOf(s: DocumentAttributionSummary): Segment[] {
  return [
    {
      key: 'fromSources',
      label: 'From sources',
      hint: 'quoted or derived from a cited source',
      chars: s.byKind.fromSources,
      fill: OK,
      textured: false,
    },
    {
      key: 'authorAsserted',
      label: 'Author-asserted',
      hint: 'a person stands behind it; nothing is cited',
      chars: s.byKind.authorAsserted,
      fill: INK,
      textured: false,
    },
    {
      key: 'machineDrafted',
      label: 'AI draft, accepted',
      hint: 'drafted by AI, accepted by a person',
      chars: s.byKind.machineDrafted,
      fill: MUTED,
      textured: false,
    },
    {
      key: 'machineDraftedUnaccepted',
      label: 'AI draft, not accepted',
      hint: 'drafted by AI; nobody has accepted it',
      chars: s.byKind.machineDraftedUnaccepted,
      fill: WARN,
      textured: true,
    },
    {
      key: 'unattributed',
      label: 'No recorded origin',
      hint: 'nothing records where this text came from',
      chars: s.unattributedChars,
      fill: RULE,
      textured: true,
    },
  ];
}

/** Whole numbers that still sum to 100, so the legend never reads 99% or 101%. */
function percent(chars: number, total: number): number {
  return total <= 0 ? 0 : Math.round((chars / total) * 100);
}

export function DocumentAttributionBar({
  documentTable,
  documentId,
  refreshToken,
  onOpenDetail,
  onSummary,
}: DocumentAttributionBarProps) {
  const [load, setLoad] = useState<Load>({ status: 'idle' });

  /* Read through a ref so a host passing an inline arrow — the obvious way —
     does not change `read`'s identity every render and re-fire the effect. */
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  const read = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const summary = await fetchDocumentAttribution({ documentTable, documentId });
      setLoad({ status: 'ready', summary });
      onSummaryRef.current?.(summary);
    } catch (err) {
      onSummaryRef.current?.(null);
      if (err instanceof AttributionUnsupportedError) {
        setLoad({ status: 'unsupported', message: err.message });
        return;
      }
      setLoad({
        status: 'error',
        message: err instanceof Error ? err.message : 'Attribution could not be read.',
      });
    }
  }, [documentTable, documentId]);

  useEffect(() => {
    if (!documentTable || !documentId) return;
    void read();
  }, [read, refreshToken, documentTable, documentId]);

  /* Every branch says which of the four it is. A spinner that resolves to
     silence, or an error rendered as an empty bar, both read as "assessed and
     clean" — the one conclusion none of them support. */
  if (load.status === 'idle' || load.status === 'loading') {
    return (
      <Shell>
        <span style={{ color: MUTED }} role="status">
          {load.status === 'loading' ? 'Reading attribution…' : 'Attribution not read yet.'}
        </span>
      </Shell>
    );
  }

  if (load.status === 'unsupported') {
    return (
      <Shell>
        <span style={{ color: MUTED }}>
          Attribution coverage is not available for this document type.
        </span>
      </Shell>
    );
  }

  if (load.status === 'error') {
    return (
      <Shell>
        <span style={{ color: WARN }} role="alert">
          Attribution could not be read, so none is shown. {load.message}
        </span>{' '}
        <button
          type="button"
          onClick={() => void read()}
          style={{
            border: `1px solid ${RULE}`,
            background: 'transparent',
            color: INK,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </Shell>
    );
  }

  const { summary } = load;

  if (summary.contentLength === 0) {
    return (
      <Shell>
        <span style={{ color: MUTED }}>This document has no text yet.</span>
      </Shell>
    );
  }

  const segments = segmentsOf(summary).filter((seg) => seg.chars > 0);
  const attributedPct = percent(summary.attributedChars, summary.contentLength);

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: INK, fontSize: 13 }}>
          {attributedPct}% of this document has a recorded origin
        </strong>
        <span style={{ color: MUTED, fontSize: 12 }}>
          {summary.attributedChars.toLocaleString()} of{' '}
          {summary.contentLength.toLocaleString()} characters
        </span>
        {onOpenDetail && (
          <button
            type="button"
            onClick={onOpenDetail}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              color: INK,
              textDecoration: 'underline',
              fontSize: 12,
              padding: 2,
              cursor: 'pointer',
            }}
          >
            Open Data Origins
          </button>
        )}
      </div>

      {/* Decorative: the legend below carries every figure this encodes. */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          height: 8,
          marginTop: 8,
          borderRadius: 4,
          overflow: 'hidden',
          background: RULE,
        }}
      >
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{
              width: `${percent(seg.chars, summary.contentLength)}%`,
              background: seg.textured ? HATCH(seg.fill) : seg.fill,
              backgroundColor: seg.textured ? 'transparent' : seg.fill,
            }}
          />
        ))}
      </div>

      <ul
        style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 2 }}
      >
        {segments.map((seg) => (
          <li
            key={seg.key}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: INK }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                flex: '0 0 auto',
                borderRadius: 2,
                border: `1px solid ${seg.fill}`,
                background: seg.textured ? HATCH(seg.fill) : seg.fill,
              }}
            />
            <span>
              {seg.label} — {percent(seg.chars, summary.contentLength)}% (
              {seg.chars.toLocaleString()} characters)
            </span>
            <span style={{ color: MUTED }}>{seg.hint}</span>
          </li>
        ))}
      </ul>

      {summary.staleChars > 0 && (
        /* Not folded into the bar: these characters ARE cited. The citation
           still exists, it just no longer matches the source it points at, and
           a reader needs to be told that rather than shown a smaller bar. */
        <p style={{ margin: '8px 0 0', fontSize: 12, color: WARN }}>
          {summary.staleChars.toLocaleString()} attributed{' '}
          {summary.staleChars === 1 ? 'character cites a source' : 'characters cite a source'} that
          has changed since it was cited.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Document attribution"
      style={{
        border: `1px solid ${RULE}`,
        borderRadius: 6,
        padding: 12,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {children}
    </section>
  );
}

export default DocumentAttributionBar;
