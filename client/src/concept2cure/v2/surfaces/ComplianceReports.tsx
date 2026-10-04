/**
 * Audit & compliance reports — the reports a client runs when an auditor, a
 * customer's QA or a regulator asks for them.
 *
 * Registry id: `compliance-reports`. Reached from Reporting & analytics and from
 * the audit trail.
 *
 * Every number and verdict on this screen is the server's: each report is a
 * deterministic query over the organisation's own records, sealed with the
 * audit export key and recorded on the audit chain before it is sent (the run
 * is refused, 503, when it cannot be recorded). This surface renders that
 * result, says what the platform does not record, saves the sealed bundle, and
 * sends a saved bundle back to the platform's verifier. It computes nothing it
 * then reports.
 *
 * The full audit trail is a catalog entry whose run is the existing signed
 * export, called through the `endpoint` its catalog row names.
 *
 * Files: complianceReportsModel.ts (catalog, period, run, refusals, AnA
 * context), complianceReportData.ts (what a run returns), ComplianceReportResult
 * (the result), ComplianceReportsVerify (verifying a saved report),
 * ComplianceReviewRecords (recording and signing a periodic review, P1-25/P1-43).
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { apiCall, apiErrorText } from '../apiCall';
import { EmptyState, ErrorState } from '../dataConnect';
import { parseReportData } from './complianceReportData';
import {
  INTEGRITY_REPORT_ID, UNREADABLE_RESULT,
  anaContextOf, defaultPeriod, parseCatalog, parseExport, periodProblem, periodRule, runErrorOf, runUrl,
  type Catalog, type CatalogState, type Period, type ReportSummary, type RunError, type RunResult,
} from './complianceReportsModel';
import { NotRecorded, ReportResult } from './ComplianceReportResult';
import { VerifySavedReport } from './ComplianceReportsVerify';
import { ReviewRecords } from './ComplianceReviewRecords';
import '../styles/project-home-v2.css';

const CATALOG_PATH = '/api/audit/reports';

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-400)' };
const tagStyle: React.CSSProperties = {
  display: 'inline-block', fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
  border: '1px solid var(--border)', color: 'var(--text-300)', whiteSpace: 'nowrap',
};
const noticeStyle: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', margin: '0 0 14px',
  border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-200)',
};

/* ── Data hooks ─────────────────────────────────────────────────────────── */

function useCatalog() {
  const [st, setSt] = useState<CatalogState>({ state: 'loading' });
  const alive = useRef(true);
  const load = useCallback(async () => {
    setSt({ state: 'loading' });
    const r = await apiCall('GET', CATALOG_PATH);
    if (!alive.current) return;
    const catalog = r.ok ? parseCatalog(r.body) : null;
    if (catalog) setSt({ state: 'ready', catalog });
    else setSt({ state: 'error', message: r.ok ? 'The catalog came back in a form this screen cannot read.' : apiErrorText(r, 'The report catalog did not respond.') });
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);
  return { st, load };
}

function useReportRun() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<RunError | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const ticket = useRef(0);
  const run = useCallback(async (report: ReportSummary, period: Period, readersNotice: string) => {
    const mine = ++ticket.current;
    setRunning(true);
    setError(null);
    setResult(null);
    const r = await apiCall('GET', runUrl(report, period, 'json'));
    if (mine !== ticket.current) return;
    setRunning(false);
    if (!r.ok) return setError(runErrorOf(r, readersNotice));
    const exp = parseExport(r.body);
    const data = exp ? parseReportData(exp.data) : null;
    if (!exp || !data) return setError({ kind: 'other', message: UNREADABLE_RESULT });
    setResult({ report, period: { ...period }, exp, data });
  }, []);
  const reset = useCallback(() => {
    ticket.current++;
    setRunning(false);
    setError(null);
    setResult(null);
  }, []);
  return { running, error, result, run, reset };
}

type ReportRun = ReturnType<typeof useReportRun>;

/* ── The surface ────────────────────────────────────────────────────────── */

export function ComplianceReports(_props: SurfaceViewProps) {
  const { st, load } = useCatalog();
  const run = useReportRun();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(() => defaultPeriod());
  const [problem, setProblem] = useState<string | null>(null);

  const catalog = st.state === 'ready' ? st.catalog : null;
  const selected = catalog?.reports.find((r) => r.id === selectedId) ?? null;

  const choose = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setProblem(null);
    run.reset();
  };
  const start = () => {
    if (!selected || !catalog) return;
    const p = periodProblem(selected.period, period);
    setProblem(p);
    if (!p) void run.run(selected, period, catalog.readersNotice);
  };

  const { running, error, result } = run;
  const anaContext = useMemo(
    () => anaContextOf(st, selected, { running, error, result }),
    [st, selected, running, error, result],
  );
  usePublishSurfaceContext('compliance-reports', anaContext);

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Reporting & analytics</div>
          <h1 className="ph-title">Audit & compliance reports</h1>
          <div className="ph-sub">Deterministic reports drawn from the organisation's own records, sealed and recorded on the audit trail when run.</div>
        </div>
      </div>
      {st.state === 'loading' && <EmptyState busy icon={I.scroll} title="Loading the report catalog…" />}
      {st.state === 'error' && (
        <ErrorState title="Couldn’t load the report catalog" message={st.message} retry={() => void load()} />
      )}
      {catalog && (
        <CatalogView
          catalog={catalog} selected={selected} onChoose={choose}
          period={period} onPeriod={setPeriod} onRun={start} problem={problem} run={run}
        />
      )}
      {catalog && <ReviewRecords canRun={catalog.canRun} result={result} />}
      <VerifySavedReport />
    </div>
  );
}

function CatalogView({ catalog, selected, onChoose, period, onPeriod, onRun, problem, run }: {
  catalog: Catalog; selected: ReportSummary | null; onChoose: (id: string) => void;
  period: Period; onPeriod: (p: Period) => void; onRun: () => void; problem: string | null; run: ReportRun;
}) {
  if (catalog.reports.length === 0) {
    return <EmptyState icon={I.scroll} title="No reports are available yet" hint="The report catalog returned no entries for this organisation." />;
  }
  const integrity = catalog.reports.some((r) => r.id === INTEGRITY_REPORT_ID) ? () => onChoose(INTEGRITY_REPORT_ID) : null;
  return (
    <>
      {!catalog.canRun && <div style={noticeStyle}><span aria-hidden="true">{I.lock}</span><span>{catalog.readersNotice}</span></div>}
      <div role="group" aria-label="Reports" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 18 }}>
        {catalog.reports.map((r) => (
          <ReportCard key={r.id} report={r} selected={r.id === selected?.id} onChoose={() => onChoose(r.id)} />
        ))}
      </div>
      {selected ? (
        <ReportDetail
          report={selected} canRun={catalog.canRun} readersNotice={catalog.readersNotice} period={period}
          onPeriod={onPeriod} onRun={onRun} problem={problem} run={run} onChooseIntegrity={integrity}
        />
      ) : (
        <div style={muted}>Choose a report to see what it covers{catalog.canRun ? ' and run it for a period' : ''}.</div>
      )}
    </>
  );
}

function ReportCard({ report, selected, onChoose }: { report: ReportSummary; selected: boolean; onChoose: () => void }) {
  return (
    <button
      type="button" className="pj-card" aria-pressed={selected} onClick={onChoose}
      style={{ gap: 6, cursor: 'pointer', ...(selected ? { borderColor: 'var(--accent-200)', background: 'var(--bg-050)' } : {}) }}
    >
      <span className="pj-card-t">{report.title}</span>
      {report.purpose && <span style={{ fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.45 }}>{report.purpose}</span>}
      {report.basis.length > 0 && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {report.basis.map((b, i) => <span key={i} style={tagStyle}>{b}</span>)}
        </span>
      )}
      {selected && <span style={{ ...muted, display: 'inline-flex', gap: 4, alignItems: 'center' }}><span aria-hidden="true">{I.check}</span>Selected</span>}
    </button>
  );
}

function ReportDetail({ report, canRun, readersNotice, period, onPeriod, onRun, problem, run, onChooseIntegrity }: {
  report: ReportSummary; canRun: boolean; readersNotice: string; period: Period; onPeriod: (p: Period) => void;
  onRun: () => void; problem: string | null; run: ReportRun; onChooseIntegrity: (() => void) | null;
}) {
  return (
    <>
      <div className="pj-card" style={{ marginBottom: 14 }}>
        <div style={muted}>{report.sections.length > 0 ? `Sections: ${report.sections.map((s) => s.title).join(', ')}.` : ''}</div>
        <div style={muted}>{periodRule(report)}</div>
        {canRun && <PeriodForm report={report} period={period} onPeriod={onPeriod} onRun={onRun} running={run.running} />}
        {problem && <div role="alert" style={{ ...noticeStyle, margin: '10px 0 0', color: 'var(--error)' }}>{problem}</div>}
        {!run.result && <NotRecorded items={report.notRecorded} />}
      </div>
      <section aria-live="polite" aria-label="Report result" aria-busy={run.running || undefined}>
        {run.error && <RunFailure error={run.error} retry={onRun} />}
        {run.result && <ReportResult result={run.result} readersNotice={readersNotice} onChooseIntegrity={onChooseIntegrity} />}
      </section>
    </>
  );
}

function PeriodForm({ report, period, onPeriod, onRun, running }: {
  report: ReportSummary; period: Period; onPeriod: (p: Period) => void; onRun: () => void; running: boolean;
}) {
  const fromId = useId();
  const toId = useId();
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-300)' };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onRun(); }}
      style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}
    >
      {report.period === 'range' && (
        <div style={field}>
          <label htmlFor={fromId}>From</label>
          <input id={fromId} className="c2c-input" type="date" value={period.from} onChange={(e) => onPeriod({ ...period, from: e.target.value })} />
        </div>
      )}
      <div style={field}>
        <label htmlFor={toId}>{report.period === 'range' ? 'To' : 'As of'}</label>
        <input id={toId} className="c2c-input" type="date" value={period.to} onChange={(e) => onPeriod({ ...period, to: e.target.value })} />
      </div>
      <button type="submit" className="btn primary" disabled={running}>{running ? 'Running…' : 'Run report'}</button>
      <span style={muted}>Dates are UTC and inclusive.</span>
    </form>
  );
}

const FAILURE_ICON: Record<Exclude<RunError['kind'], 'other'>, React.ReactNode> = {
  readers: I.lock, refused: I.lock, busy: I.clock, period: I.alertTriangle, 'not-recorded': I.alertTriangle,
};

function RunFailure({ error, retry }: { error: RunError; retry: () => void }) {
  if (error.kind === 'other') {
    return <ErrorState title="Couldn’t run the report" message={error.message} retry={retry} />;
  }
  return (
    <div role="alert" style={{ ...noticeStyle, ...(error.kind === 'not-recorded' ? { borderColor: 'var(--warning)' } : {}) }}>
      <span aria-hidden="true">{FAILURE_ICON[error.kind]}</span>
      <span>{error.message}</span>
    </div>
  );
}
