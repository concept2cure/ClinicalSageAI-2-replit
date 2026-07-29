/**
 * ReportView — renders a full `RenderedReport` document.
 *
 * Header carries the report identity (type, scope, status pill, confidence,
 * generated-at) and a truthfulness banner when the run is not yet final or was
 * downgraded by the server gate. Sections map to titled groups of
 * `ReportBlockView`. Export is a plain anchor to the server's PDF endpoint — a
 * navigable link, not a button, so it stays a real GET.
 *
 * Voice + color follow the design system: sentence case, calm earthy tones,
 * factual status, numbers over adjectives.
 *
 * @module client/src/concept2cure/insights/surface/ReportView
 */

import * as React from 'react';
import { REPORT_OS_BASE } from '../data/api';
import type { RenderedReport, ReportRunStatus } from '../data/types';
import { ReportBlockView } from './ReportBlockView';

export interface ReportViewProps {
  /** The rendered report document to display. */
  report: RenderedReport;
  /** Optional run id used to build the export link; falls back to scope when absent. */
  runId?: number | string;
}

const STATUS_PILL: Record<ReportRunStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'drafted' },
  partial: { label: 'Partial', className: 'review' },
  final: { label: 'Final', className: 'complete' },
};

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReportView({ report, runId }: ReportViewProps): React.ReactElement {
  const pill = STATUS_PILL[report.status] ?? STATUS_PILL.draft;
  const truthfulness = report.truthfulness;
  const isDowngraded = Boolean(truthfulness?.downgradedFrom);
  const showBanner = report.status !== 'final' || isDowngraded;
  const exportHref =
    runId !== undefined && runId !== ''
      ? `${REPORT_OS_BASE}/runs/${runId}/export.pdf`
      : undefined;

  return (
    <div>
      <div className="in-sec-head" style={{ marginBottom: 12 }}>
        <h1 className="in-h1" style={{ margin: 0 }}>
          {report.reportTypeId}
        </h1>
        <span className="in-status" style={{ alignSelf: 'center' }}>
          <span className={`in-status ${pill.className}`}>
            <span className="dot" />
            {pill.label}
          </span>
        </span>
        <span className="spacer" />
        {exportHref ? (
          <a className="link" href={exportHref} target="_blank" rel="noreferrer">
            Export to PDF →
          </a>
        ) : null}
      </div>

      <p className="in-sub" style={{ marginBottom: 16 }}>
        {report.scopeType} · {report.scopeId} · generated {formatGeneratedAt(report.generatedAt)}
        {truthfulness ? ` · allowed status ${truthfulness.allowedStatus}` : ''}
      </p>

      {showBanner ? (
        <div
          role="status"
          style={{
            marginBottom: 20,
            padding: '12px 14px',
            borderLeft: '3px solid #d97706',
            background: 'rgba(217,119,6,0.06)',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-100)',
              marginBottom: truthfulness?.reasons?.length ? 6 : 0,
            }}
          >
            {report.status !== 'final'
              ? `${pill.label} — blocking gaps`
              : 'Status downgraded by truthfulness gate'}
            {isDowngraded ? ` (downgraded from ${truthfulness?.downgradedFrom})` : ''}
          </div>
          {truthfulness?.reasons?.length ? (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-400)' }}>
              {truthfulness.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {report.sections.map((section) => (
        <div key={section.id} className="in-sec">
          <div className="in-sec-head">
            <h2>{section.title}</h2>
          </div>
          {section.blocks.map((block, i) => (
            <ReportBlockView key={`${section.id}-${i}`} block={block} />
          ))}
        </div>
      ))}
    </div>
  );
}
