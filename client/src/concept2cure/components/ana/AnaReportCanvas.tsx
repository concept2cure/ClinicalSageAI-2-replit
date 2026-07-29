/**
 * AnA Reporting Canvas — the inline panel AnA renders when it generates a
 * governed report or suggests a best-practices dashboard. Mounted beneath an
 * assistant message (mirrors WarGameReport), driven by the `report_canvas` SSE
 * envelope. Every value shown is computed by the governed engine; this component
 * only presents it. Charts reuse the governed `ChartBlock`; the other block
 * kinds are rendered compactly for the chat context.
 */

import * as React from 'react';
import { ChartBlock } from '../../insights/charts';
import type { RenderedReport, ReportBlock } from '../../insights/data/types';
import type { AnaChatMessage } from './useAnaChat';

type CanvasData = NonNullable<AnaChatMessage['reportCanvas']>;

export interface AnaReportCanvasProps {
  canvas: CanvasData;
  /** Send a follow-up prompt to AnA (generate a suggested report / save preset). */
  onAction?: (prompt: string) => void;
}

/** The inline canvas: a governed report render, or a best-practices suggestion set. */
export function AnaReportCanvas({ canvas, onAction }: AnaReportCanvasProps): React.ReactElement | null {
  if (canvas.kind === 'report') {
    return <ReportCanvas report={canvas.report as RenderedReport} />;
  }
  if (canvas.kind === 'suggestions') {
    return <SuggestionsCanvas canvas={canvas} onAction={onAction} />;
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', partial: 'Advisory', final: 'Final' };

const wrap: React.CSSProperties = {
  border: '1px solid var(--c2c-border, #e6e2da)',
  borderRadius: 12,
  background: 'var(--c2c-surface, #faf9f5)',
  padding: 16,
  marginTop: 10,
};
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 };
const title: React.CSSProperties = { fontWeight: 600, fontSize: 14 };
const pill: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--c2c-border, #e6e2da)', whiteSpace: 'nowrap' };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.7, margin: '12px 0 6px' };
const kpiRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const kpi: React.CSSProperties = { minWidth: 120, flex: '1 1 120px', border: '1px solid var(--c2c-border, #e6e2da)', borderRadius: 8, padding: '8px 10px' };
const kpiLabel: React.CSSProperties = { fontSize: 11, opacity: 0.7 };
const kpiValue: React.CSSProperties = { fontSize: 18, fontWeight: 600 };
const chip: React.CSSProperties = { fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--c2c-border, #e6e2da)', background: 'transparent', cursor: 'pointer' };
const note: React.CSSProperties = { fontSize: 12, opacity: 0.75, marginTop: 6 };

function BlockView({ block }: { block: ReportBlock }): React.ReactElement | null {
  switch (block.kind) {
    case 'summary':
      return <p style={{ fontSize: 13, margin: '4px 0' }}>{block.text}</p>;
    case 'narrative':
      return (
        <div style={{ margin: '4px 0' }}>
          <p style={{ fontSize: 13, margin: 0 }}>{block.text}</p>
          <p style={note}>AI-generated · {block.disclosure}</p>
        </div>
      );
    case 'metric':
      return (
        <div style={kpi}>
          <div style={kpiLabel}>{block.label}</div>
          <div style={kpiValue}>
            {block.value ?? '—'}
            {block.unit ? <span style={{ fontSize: 12, opacity: 0.7 }}> {block.unit}</span> : null}
          </div>
          {block.status ? <div style={{ ...kpiLabel, marginTop: 2 }}>{block.status}</div> : null}
        </div>
      );
    case 'table':
      return (
        <div style={{ overflowX: 'auto', margin: '6px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr>{block.columns.map((c, i) => <th key={i} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--c2c-border, #e6e2da)' }}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid var(--c2c-border, #f0ede6)' }}>{cell ?? '—'}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'chart':
      return (
        <div style={{ margin: '6px 0' }}>
          <ChartBlock chartType={block.chartType} spec={block.spec} />
        </div>
      );
    case 'gap-list':
      return (
        <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 12 }}>
          {block.items.map((it, i) => (
            <li key={i}>{it.severity ? <strong>[{it.severity}] </strong> : null}{it.title}{it.message ? ` — ${it.message}` : ''}</li>
          ))}
        </ul>
      );
    case 'blocker-list':
      return (
        <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 12 }}>
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );
    case 'disclosure':
      return (
        <p style={note}>
          Method: {block.method} · {block.validated ? 'validated' : 'not validated'}
          {typeof block.confidence === 'number' ? ` · confidence ${block.confidence}` : ''} — {block.note}
        </p>
      );
    default:
      return null;
  }
}

function ReportCanvas({ report }: { report: RenderedReport }): React.ReactElement {
  return (
    <div style={wrap} role="group" aria-label={`Report: ${report.reportTypeId}`}>
      <div style={head}>
        <span style={title}>{report.reportTypeId}</span>
        <span style={pill}>{STATUS_LABEL[report.status] ?? report.status}</span>
      </div>
      {report.sections.map((section) => (
        <div key={section.id}>
          <div style={sectionTitle}>{section.title}</div>
          {(() => {
            const metrics = section.blocks.filter((b) => b.kind === 'metric');
            const others = section.blocks.filter((b) => b.kind !== 'metric');
            return (
              <>
                {metrics.length > 0 && (
                  <div style={kpiRow}>{metrics.map((b, i) => <BlockView key={i} block={b} />)}</div>
                )}
                {others.map((b, i) => <BlockView key={i} block={b} />)}
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

function SuggestionsCanvas({
  canvas,
  onAction,
}: {
  canvas: Extract<CanvasData, { kind: 'suggestions' }>;
  onAction?: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div style={wrap} role="group" aria-label="Recommended reports">
      <div style={head}>
        <span style={title}>Recommended for you</span>
        <span style={pill}>{canvas.segments.length ? canvas.segments.join(' · ') : 'universal'} · {canvas.tier}</span>
      </div>

      {canvas.preset && canvas.preset.panels.length > 0 && (
        <div style={{ ...kpi, minWidth: 'unset', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{canvas.preset.title}</div>
          <div style={note}>
            {canvas.preset.panels.map((p) => p.label || p.reportTypeId).join(' · ')}
          </div>
          {onAction && (
            <button
              type="button"
              style={{ ...chip, marginTop: 8 }}
              onClick={() => onAction(`Save the recommended dashboard "${canvas.preset!.title}"`)}
            >
              Save this dashboard
            </button>
          )}
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {canvas.suggestions.slice(0, 8).map((s) => (
          <li key={s.typeId} style={{ border: '1px solid var(--c2c-border, #e6e2da)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              {s.entitled ? (
                onAction ? (
                  <button
                    type="button"
                    style={chip}
                    onClick={() => onAction(`Generate the "${s.label}" report (${s.typeId})`)}
                  >
                    Generate
                  </button>
                ) : null
              ) : (
                <span style={{ ...pill, opacity: 0.8 }}>Locked · {s.requiredTier}</span>
              )}
            </div>
            {s.reasons.length > 0 && <div style={note}>{s.reasons[0]}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
