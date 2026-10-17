import * as React from 'react';
import { Link } from 'wouter';
import type { UseAnalyticsResult } from '../hooks/useAnalytics';

type ReportLibraryProps = Pick<UseAnalyticsResult,
  'reports' | 'reportsTotal' | 'reportsHasMore' | 'reportsLoading' | 'reportsError' | 'refreshReports'>;

function recordedDate(value: string | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Date not recorded';
  return new Date(value).toLocaleString();
}

/** Uses Reporting's saved-run register and exact run viewer, under its existing access policy. */
export function AnalyticsReportLibrary(props: ReportLibraryProps) {
  const unavailable = props.reportsError || (!props.reportsLoading && props.reports === null);
  return (
    <section className="section" aria-label="Saved reports">
      <div className="section-head">
        <h2>Reports and dossiers</h2>
        {props.reports !== null && !props.reportsLoading && !unavailable && (
          <span className="section-sub">
            {props.reports.length} of {props.reportsTotal} authorized saved reports
          </span>
        )}
        <Link className="btn ghost small" href="/concept2cure/insights">Open Reporting</Link>
      </div>
      {props.reportsLoading ? (
        <p role="status">Loading saved reports…</p>
      ) : unavailable ? (
        <div role="alert">
          <p>Saved reports are unavailable. Access or the report source could not be verified.</p>
          <button className="btn ghost small" type="button" onClick={props.refreshReports}>Retry saved reports</button>
        </div>
      ) : props.reports?.length === 0 ? (
        <p>No saved reports are visible in your authorized report register.</p>
      ) : (
        <div className="docs-panel">
          {props.reports?.map((report) => (
            <div className="docs-row" key={report.id}>
              <Link className="docs-row-main" href={`/concept2cure/insights?reportRunId=${report.id}`}>
                <div className="docs-body">
                  <div className="docs-head"><span className="status-pill">{report.status}</span></div>
                  <div className="docs-title">{report.reportTypeLabel || report.reportTypeId}</div>
                  <div className="docs-meta">
                    <span>Run {report.id}</span>
                    <span>{report.scopeLabel || report.computedScope || report.scopeType}</span>
                    <span>{recordedDate(report.updatedAt || report.createdAt)}</span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
          {props.reportsHasMore && <p>More authorized reports are available in Reporting.</p>}
        </div>
      )}
    </section>
  );
}
