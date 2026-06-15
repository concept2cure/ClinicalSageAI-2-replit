/**
 * ReportBlockView — renders a single rendered-report `ReportBlock` by its kind.
 *
 * The block union is discriminated on `kind` (see `../data/types.ts`); every arm
 * here is presentational and reads only the data the server provided. Provenance
 * is surfaced through `title` / `aria-label` text built from the supplied refs —
 * never fabricated, never invented when absent. Unknown kinds render nothing so a
 * forward-compatible server payload can never throw at render.
 *
 * Voice + color follow the design system: sentence case, numbers over adjectives,
 * earthy amber/red tones for gaps and blockers, calm disclosure callouts. Tone is
 * always carried by a text label, never by color alone.
 *
 * @module client/src/concept2cure/insights/surface/ReportBlockView
 */

import * as React from 'react';
import { ChartBlock } from '../charts';
import type { ProvenanceRef, ReportBlock } from '../data/types';

export interface ReportBlockViewProps {
  /** A single rendered-report block to display. */
  block: ReportBlock;
}

/**
 * Build a human-readable provenance string from the source refs. Returns
 * `undefined` when there is nothing to attribute, so callers can omit the
 * affordance entirely rather than show an empty one.
 */
function describeProvenance(refs?: ProvenanceRef[]): string | undefined {
  if (!refs || refs.length === 0) return undefined;
  const parts = refs.map((ref) => {
    const field = ref.sourceField ? `.${ref.sourceField}` : '';
    const record = ref.recordId !== undefined ? ` #${ref.recordId}` : '';
    const transform = ref.transformation ? ` · ${ref.transformation}` : '';
    return `${ref.sourceTable}${field}${record}${transform}`;
  });
  return `Derived from ${parts.join('; ')}`;
}

/** Olive / amber / red tone for a gap-list severity, with a text label. */
const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#8a3a3a',
  high: '#c84a4a',
  medium: '#d97706',
  low: 'var(--text-300)',
};

export function ReportBlockView({ block }: ReportBlockViewProps): React.ReactElement | null {
  switch (block.kind) {
    case 'summary':
      return (
        <p className="in-sub" style={{ marginBottom: 12, maxWidth: 720 }}>
          {block.text}
        </p>
      );

    case 'narrative':
      return (
        <div style={{ marginBottom: 12, maxWidth: 720 }}>
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 13,
              color: 'var(--text-100)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {block.text}
          </p>
          <p
            style={{
              fontSize: 10.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-400)',
              fontWeight: 600,
              marginTop: 6,
            }}
            title={block.disclosure}
          >
            AI-generated narrative · {block.disclosure}
          </p>
        </div>
      );

    case 'metric': {
      const provenance = describeProvenance(block.provenance);
      const display =
        block.value === null || block.value === undefined ? '—' : String(block.value);
      const statusLabel =
        block.status === 'missing'
          ? 'Missing'
          : block.status === 'partial'
            ? 'Partial'
            : block.status === 'ready'
              ? 'Ready'
              : undefined;
      return (
        <div className="in-kpi" style={{ marginBottom: 12, display: 'inline-block', minWidth: 180 }}>
          <div className="lbl">{block.label}</div>
          <div className="val" title={provenance} aria-label={provenance}>
            {display}
            {block.unit ? <span className="unit">{block.unit}</span> : null}
          </div>
          {statusLabel ? (
            <div className="sub">
              <span
                style={{
                  color:
                    block.status === 'missing'
                      ? '#c84a4a'
                      : block.status === 'partial'
                        ? '#d97706'
                        : '#788c5d',
                }}
              >
                {statusLabel}
              </span>
            </div>
          ) : null}
          {provenance ? (
            <div className="sub" style={{ fontSize: 10.5, fontStyle: 'italic' }} title={provenance}>
              Source on hover
            </div>
          ) : null}
        </div>
      );
    }

    case 'table': {
      const provenance = describeProvenance(block.provenance);
      const cols = `repeat(${block.columns.length}, minmax(0, 1fr))`;
      return (
        <div
          className="in-table"
          style={{ marginBottom: 12 }}
          title={provenance}
          aria-label={provenance}
        >
          <div className="in-thead" style={{ gridTemplateColumns: cols }}>
            {block.columns.map((col, i) => (
              <span key={i}>{col}</span>
            ))}
          </div>
          {block.rows.map((row, r) => (
            <div key={r} className="in-row" style={{ gridTemplateColumns: cols, cursor: 'default' }}>
              {row.map((cell, c) => (
                <span key={c} className="num">
                  {cell === null || cell === undefined ? '—' : String(cell)}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }

    case 'chart':
      return (
        <div className="in-card" style={{ marginBottom: 12 }}>
          <ChartBlock chartType={block.chartType} spec={block.spec} />
        </div>
      );

    case 'gap-list':
      return (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {block.items.map((item, i) => {
            const sev = item.severity ?? 'medium';
            return (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '7px 0',
                  borderTop: i === 0 ? '0' : '1px dashed #e8e6dc',
                  fontSize: 12.5,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: SEVERITY_COLOR[sev],
                    flex: '0 0 64px',
                  }}
                >
                  {SEVERITY_LABEL[sev]}
                </span>
                <span style={{ color: 'var(--text-100)', flex: 1, minWidth: 0 }}>
                  {item.title}
                  {item.message ? (
                    <span style={{ color: 'var(--text-400)', display: 'block', fontSize: 11 }}>
                      {item.message}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      );

    case 'blocker-list':
      return (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {block.items.map((item, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                padding: '7px 0',
                borderTop: i === 0 ? '0' : '1px dashed #e8e6dc',
                fontSize: 12.5,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: '#8a3a3a',
                  flex: '0 0 64px',
                }}
              >
                Blocking
              </span>
              <span style={{ color: 'var(--text-100)', flex: 1, minWidth: 0 }}>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'disclosure':
      return (
        <div
          role="note"
          style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderLeft: '3px solid #d97706',
            background: 'rgba(217,119,6,0.06)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: 'var(--text-400)',
              marginBottom: 4,
            }}
          >
            Method disclosure
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-100)', marginBottom: 4 }}>
            {block.method}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>
            {block.validated ? 'Validated' : 'Not validated'}
            {block.confidence !== undefined
              ? ` · confidence ${(block.confidence * 100).toFixed(0)}%`
              : ''}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-400)', marginTop: 4, fontStyle: 'italic' }}>
            {block.note}
          </div>
        </div>
      );

    default:
      return null;
  }
}
