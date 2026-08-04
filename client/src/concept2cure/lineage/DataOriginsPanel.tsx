/**
 * Data Origins — the report panel.
 *
 * Opens beside the document rather than over it: the reader asked "where did
 * THIS come from", and taking the passage off screen to answer makes them hold
 * it in their head. The selection stays visible and highlighted; the panel
 * explains it.
 *
 * DESIGN INTENT
 * The panel answers three questions in priority order, because that is the
 * order a reviewer asks them:
 *
 *   1. Is all of this accounted for?   the coverage bar, first thing, colour-coded
 *   2. Where did it come from?         each origin, with how the source was used
 *   3. What ISN'T accounted for?       unattributed ranges, given equal weight
 *
 * Point 3 is why this is not a list of sources. A provenance view that shows
 * only what it found reads as complete and quietly launders the gaps. The gaps
 * are a section, not a footnote.
 *
 * Theme-neutral inline styling, matching LineageDossier — this panel is mounted
 * inside several different shells and must read in all of them.
 *
 * @module client/src/concept2cure/lineage/DataOriginsPanel
 */

import { useEffect, useState } from 'react';

import {
  downloadDataOriginsPdf,
  fetchDataOrigins,
  type DataOriginsReport,
  type OriginRow,
  type SelectionQuery,
} from './dataOriginsApi';

const INK = 'var(--c2c-ink, #111827)';
const MUTED = 'var(--c2c-muted, #6b7280)';
const RULE = 'var(--c2c-rule, rgba(127,127,127,0.22))';
const OK = '#047857';
const WARN = '#b45309';
const PANEL_BG = 'var(--c2c-surface, rgba(127,127,127,0.06))';

const USAGE_LABEL: Record<string, string> = {
  quoted: 'Quoted verbatim',
  paraphrased: 'Paraphrased',
  summarized: 'Summarised',
  derived: 'Derived from',
  computed: 'Computed from',
  asserted: 'Asserted by the author',
};

const STATE_NOTE: Record<string, { text: string; color: string }> = {
  changed: { text: 'Source has changed since this was written', color: WARN },
  unresolved: { text: 'Source no longer resolvable', color: WARN },
  unverified: { text: 'Source checksum unavailable', color: MUTED },
};

export interface DataOriginsPanelProps {
  query: SelectionQuery | null;
  onClose: () => void;
  /** Jump to a source in the Data Room. Omitted → source titles are not links. */
  onNavigateToSource?: (sourceId: string) => void;
}

function CoverageBar({ percent }: { percent: number }) {
  const complete = percent === 100;
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: RULE,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, percent))}%`,
            height: '100%',
            background: complete ? OK : WARN,
            transition: 'width 240ms ease',
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: complete ? OK : WARN, fontWeight: 600 }}>
        {percent}% of the selection has recorded origins
      </div>
    </div>
  );
}

function OriginCard({
  row,
  onNavigateToSource,
}: {
  row: OriginRow;
  onNavigateToSource?: (sourceId: string) => void;
}) {
  const isAuthor = row.provenanceKind === 'author_assertion';
  const note = row.state ? STATE_NOTE[row.state] : undefined;
  const canNavigate = !isAuthor && !!row.referenceId && !!onNavigateToSource;

  return (
    <li
      style={{
        listStyle: 'none',
        padding: '12px 0',
        borderTop: `1px solid ${RULE}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: isAuthor ? MUTED : OK,
            flex: '0 0 auto',
          }}
        />
        {canNavigate ? (
          <button
            type="button"
            onClick={() => onNavigateToSource!(row.referenceId!)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              fontWeight: 600,
              color: INK,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              cursor: 'pointer',
            }}
          >
            {row.sourceTitle || `Source #${row.referenceId}`}
          </button>
        ) : (
          <span style={{ fontWeight: 600, color: INK }}>
            {isAuthor
              ? 'Author assertion'
              : row.sourceTitle || `Source #${row.referenceId ?? '—'}`}
          </span>
        )}
      </div>

      <div style={{ marginTop: 4, fontSize: 12, color: MUTED }}>
        {USAGE_LABEL[row.usage] ?? row.usage}
        {' · '}
        characters {row.charStart}–{row.charEnd}
        {row.sourceLocator ? ` · ${row.sourceLocator}` : ''}
        {row.assertedBy ? ` · by ${row.assertedBy}` : ''}
        {row.confidence != null ? ` · confidence ${Math.round(row.confidence * 100)}%` : ''}
      </div>

      {note && (
        <div style={{ marginTop: 6, fontSize: 12, color: note.color, fontWeight: 600 }}>
          {note.text}
        </div>
      )}
    </li>
  );
}

export function DataOriginsPanel({ query, onClose, onNavigateToSource }: DataOriginsPanelProps) {
  const [report, setReport] = useState<DataOriginsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);

    fetchDataOrigins(query)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [query]);

  // Escape closes — this is an inspector, not a modal task, and it should never
  // feel like something the reader has to dismiss carefully.
  useEffect(() => {
    if (!query) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, onClose]);

  if (!query) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadDataOriginsPdf(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <aside
      aria-label="Data origins"
      data-lineage-ignore
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, 92vw)',
        background: PANEL_BG,
        backdropFilter: 'blur(12px)',
        borderLeft: `1px solid ${RULE}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
      }}
    >
      <header style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK, letterSpacing: 0.2 }}>
              Data Origins
            </h2>
            <div style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
              characters {query.charStart}–{query.charEnd}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close data origins"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              lineHeight: 1,
              color: MUTED,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            ×
          </button>
        </div>

        {report && <CoverageBar percent={report.coveragePercent} />}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 20px' }}>
        {loading && (
          <p style={{ fontSize: 13, color: MUTED, marginTop: 16 }}>Resolving origins…</p>
        )}

        {error && (
          <p style={{ fontSize: 13, color: WARN, marginTop: 16 }} role="alert">
            {error}
          </p>
        )}

        {report && (
          <>
            {query.selectionText && (
              <blockquote
                style={{
                  margin: '16px 0 0',
                  padding: '10px 12px',
                  borderLeft: `3px solid ${RULE}`,
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: INK,
                  maxHeight: 120,
                  overflow: 'auto',
                }}
              >
                {query.selectionText}
              </blockquote>
            )}

            <div style={{ marginTop: 18, fontSize: 12, color: MUTED }}>
              {report.counts.total} origin{report.counts.total === 1 ? '' : 's'}
              {' · '}
              {report.counts.fromSources} from sources
              {' · '}
              {report.counts.authorAsserted} authored
              {report.counts.stale > 0 && (
                <span style={{ color: WARN, fontWeight: 600 }}>
                  {' · '}
                  {report.counts.stale} against changed sources
                </span>
              )}
            </div>

            <ul style={{ margin: '10px 0 0', padding: 0 }}>
              {report.origins.map((row) => (
                <OriginCard key={row.id} row={row} onNavigateToSource={onNavigateToSource} />
              ))}
            </ul>

            {report.origins.length === 0 && (
              <p style={{ fontSize: 13, color: WARN, marginTop: 16, fontWeight: 600 }}>
                No recorded origin for any part of this selection.
              </p>
            )}

            {/* Given equal weight to the origins above — a provenance view that
                shows only what it found reads as complete. */}
            <section style={{ marginTop: 24 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: report.uncovered.length ? WARN : MUTED,
                }}
              >
                Unattributed
              </h3>
              {report.uncovered.length === 0 ? (
                <p style={{ fontSize: 13, color: OK, marginTop: 8 }}>
                  Every character of the selection has a recorded origin.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: WARN, marginTop: 8 }}>
                    {report.uncovered.length} range{report.uncovered.length === 1 ? '' : 's'} with no
                    recorded origin.
                  </p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {report.uncovered.map((g) => (
                      <li
                        key={`${g.charStart}-${g.charEnd}`}
                        style={{ fontSize: 12, color: MUTED, marginTop: 2 }}
                      >
                        characters {g.charStart}–{g.charEnd}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </>
        )}
      </div>

      <footer style={{ padding: '12px 20px', borderTop: `1px solid ${RULE}` }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={!report || exporting}
          style={{
            width: '100%',
            padding: '9px 12px',
            fontSize: 13,
            fontWeight: 600,
            color: INK,
            background: 'transparent',
            border: `1px solid ${RULE}`,
            borderRadius: 6,
            cursor: report && !exporting ? 'pointer' : 'default',
            opacity: report && !exporting ? 1 : 0.55,
          }}
        >
          {exporting ? 'Preparing PDF…' : 'Download as PDF'}
        </button>
      </footer>
    </aside>
  );
}

export default DataOriginsPanel;
