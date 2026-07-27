/**
 * RBM metric ingest — the operator-facing end of the load path.
 *
 * The ingestion service and its endpoint landed without any way for a data
 * manager to actually use them: only an API client could load an extract. This
 * is that affordance.
 *
 * The design commitment worth stating: the outcome panel reports what the load
 * ACTUALLY did, not that it succeeded. A run that accepts 380 of 400 rows, or
 * that lands 400 rows against metric names matching no configured indicator, is
 * not a success — and both are the normal case on a first load against a new
 * extract. So accepted/rejected counts, per-row reject reasons, and the
 * unmatched metric names are all rendered, and a partial or failed run says so
 * in its own tone. Hiding any of that would reproduce the exact problem this
 * whole workstream exists to remove.
 *
 * @module concept2cure/v2/surfaces/RbmIngest
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { useRbmMutation, rbmWrite, RbmWriteError } from './rbmWrites';

/** The sponsor system-of-record categories the API accepts. */
const SOURCES = ['edc', 'ctms', 'safety', 'lab', 'irt', 'ecoa', 'vendor', 'manual_upload'] as const;
const SOURCE_LABEL: Record<string, string> = {
  edc: 'EDC', ctms: 'CTMS', safety: 'Safety database', lab: 'Central lab',
  irt: 'IRT / RTSM', ecoa: 'eCOA / ePRO', vendor: 'Vendor feed', manual_upload: 'Manual upload',
};

interface RowReject { row: number; reason: string }
interface IngestResult {
  runId: number;
  status: 'succeeded' | 'partial' | 'failed';
  received: number;
  accepted: number;
  rejected: number;
  rejects: RowReject[];
  projection: {
    kriReadings: number;
    qtlUpdates: number;
    subjectProfiles: number;
    siteObservations: number;
    unmatched: string[];
  };
}

const TEMPLATE = 'metric_key,scope_level,scope_id,value,numerator,denominator,unit,observed_at';

/** What the load actually did — counts, rejects and unmatched metrics. */
function IngestOutcome({ result }: { result: IngestResult }) {
  const p = result.projection;
  const tone = result.status === 'succeeded' ? 'ok' : result.status === 'partial' ? 'warn' : 'err';
  const projected = p.kriReadings + p.qtlUpdates + p.subjectProfiles;
  return (
    <div className="rbm-ingest-out" data-tone={tone} role="status">
      <div className="rbm-ingest-out-h">
        {result.status === 'succeeded' ? I.check : I.alertTriangle}
        Run {result.runId} — {result.status}
      </div>
      <div className="rbm-ingest-out-counts">
        <span><b>{result.received}</b> received</span>
        <span><b>{result.accepted}</b> accepted</span>
        <span data-bad={result.rejected > 0 || undefined}><b>{result.rejected}</b> rejected</span>
      </div>
      <div className="rbm-ingest-out-proj">
        {p.kriReadings} KRI reading{p.kriReadings === 1 ? '' : 's'} ·{' '}
        {p.qtlUpdates} QTL value{p.qtlUpdates === 1 ? '' : 's'} ·{' '}
        {p.subjectProfiles} subject profile{p.subjectProfiles === 1 ? '' : 's'} ·{' '}
        {p.siteObservations} site/country observation{p.siteObservations === 1 ? '' : 's'} stored
      </div>
      {/* Rows landed but bound to no indicator. Stated plainly: without this,
          "accepted 400, rejected 0" would read as a clean load while every
          indicator stayed unevaluated. */}
      {p.unmatched.length > 0 && (
        <div className="rbm-ingest-warn">
          {I.info}<b>{p.unmatched.length} metric name{p.unmatched.length === 1 ? '' : 's'} matched no configured KRI or QTL.</b>{' '}
          The rows are stored with their provenance, but they updated no indicator — the names must match a KRI name or a QTL parameter for that:{' '}
          <span className="mono">{p.unmatched.slice(0, 8).join(', ')}</span>
          {p.unmatched.length > 8 ? ` and ${p.unmatched.length - 8} more` : ''}.
        </div>
      )}
      {projected === 0 && result.accepted > 0 && p.siteObservations === 0 && (
        <div className="rbm-ingest-warn">{I.alertTriangle}Nothing on this study changed as a result of this load.</div>
      )}
      {result.rejects.length > 0 && (
        <div className="rbm-ingest-rejects">
          <div className="rbm-ingest-rejects-h">Rejected rows</div>
          <table className="rbm-trend-tbl">
            <thead><tr><th>Row</th><th>Reason</th></tr></thead>
            <tbody>
              {result.rejects.slice(0, 25).map((r, i) => (
                <tr key={i}><td className="mono">{r.row}</td><td>{r.reason}</td></tr>
              ))}
            </tbody>
          </table>
          {result.rejects.length > 25 && (
            <div className="rbm-ingest-more">{result.rejects.length - 25} further rejected row(s) — all are recorded on the run.</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Load a metric extract for a study. Accepts a picked file or pasted delimited
 * text; both go through the same server-side validation, so the rules cannot
 * differ between the two.
 */
export function RbmIngestDialog({ programId, onClose, onReload }: {
  programId: string;
  onClose: () => void;
  onReload?: () => void;
}) {
  const [source, setSource] = useState<string>('edc');
  const [cutoff, setCutoff] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  // A refusal because this exact extract is already loaded. Held separately from
  // mut.error so the reprocess path can be offered in place, with the operator's
  // file and cutoff still in the form.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [reprocessReason, setReprocessReason] = useState('');
  const mut = useRbmMutation(onReload);

  const readFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  /**
   * Load the extract. `reprocess` is only ever set by the operator explicitly
   * accepting the duplicate warning — a retry must not silently become a second
   * load, because a second load appends KRI readings rather than doing nothing.
   */
  const submit = (reprocess = false) => mut.run(async () => {
    try {
      const data = await rbmWrite<IngestResult>('POST', '/rbm-metric-ingest', {
        programId,
        source,
        sourceRef: fileName,
        dataCutoff: cutoff || null,
        csv,
        ...(reprocess ? { reprocess: true, reprocessReason: reprocessReason.trim() } : {}),
      });
      setDuplicate(null);
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The server's 409 already explains which run holds this content and when.
      // Surfacing it as its own state — rather than a generic error — is what
      // makes the deliberate path discoverable instead of a dead end.
      if (/already loaded/i.test(msg)) {
        setDuplicate(msg);
        return;
      }
      throw err;
    }
  });

  return (
    <div className="rbm-modal-scrim" role="dialog" aria-modal="true" aria-label="Load a metric extract">
      <div className="rbm-modal rbm-modal-wide">
        <div className="rbm-modal-h">{I.database}<span>Load a metric extract</span></div>
        <div className="rbm-modal-what">
          Land measurements against this study. Study-scope rows update the KRI or QTL whose
          name they match; subject-scope rows feed the patient cohort scoring. Every row is
          validated server-side and anything unusable comes back with a reason.
        </div>

        <label className="rbm-field"><span>Source feed</span>
          <select value={source} disabled={mut.busy} onChange={e => setSource(e.target.value)}>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>

        <label className="rbm-field"><span>Data cutoff</span>
          <input type="date" value={cutoff} disabled={mut.busy} onChange={e => setCutoff(e.target.value)} />
          <em className="rbm-field-hint">
            The date the extract represents, not today. Freshness is measured from this — an
            export pulled weeks ago does not become current by being loaded now.
          </em>
        </label>

        <label className="rbm-field"><span>Extract file</span>
          <input type="file" accept=".csv,.tsv,.txt,text/csv" disabled={mut.busy}
            onChange={e => readFile(e.target.files?.[0])} />
          <em className="rbm-field-hint">
            Header row required. Columns: <span className="mono">{TEMPLATE}</span>. Only
            <span className="mono"> metric_key</span> and a value (or a numerator/denominator pair) are
            mandatory; <span className="mono">scope_level</span> defaults to study.
          </em>
        </label>

        <label className="rbm-field"><span>…or paste the rows</span>
          <textarea rows={5} value={csv} disabled={mut.busy}
            placeholder={`${TEMPLATE}\nQuery rate,study,,12.5,,,%,2026-07-20`}
            onChange={e => { setCsv(e.target.value); setFileName(null); }} />
        </label>

        <RbmWriteError error={mut.error} onDismiss={mut.clearError} />

        {duplicate && !result && (
          <div className="rbm-modal-note" role="alert" style={{ borderLeft: '3px solid var(--warning)' }}>
            <b>Already loaded.</b> {duplicate}
            <label className="rbm-field" style={{ marginTop: 8 }}>
              <span>Reason for reprocessing</span>
              <textarea rows={2} value={reprocessReason} disabled={mut.busy}
                placeholder="e.g. the unit mapping for query_rate was corrected"
                onChange={e => setReprocessReason(e.target.value)} />
              <em className="rbm-field-hint">
                Reprocessing supersedes the earlier run and retracts the readings it
                appended, so the history is replaced rather than doubled. The earlier run
                stays on file with this reason recorded against its replacement.
              </em>
            </label>
            <button className="rbm-btn" disabled={mut.busy || reprocessReason.trim().length < 3}
              onClick={() => submit(true)}>
              {mut.busy ? 'Reprocessing…' : 'Reprocess and replace that run'}
            </button>
          </div>
        )}

        {result && <IngestOutcome result={result} />}

        <div className="rbm-modal-note">
          The run is recorded with its source, cutoff and row counts. That provenance is what
          lets the board say how current each indicator's data is — an indicator is not
          evidence of control without it.
        </div>
        <div className="rbm-modal-acts">
          <button className="rbm-btn" onClick={onClose} disabled={mut.busy}>{result ? 'Close' : 'Cancel'}</button>
          <button className="rbm-btn pri" disabled={mut.busy || !csv.trim()} onClick={() => submit()}>
            {mut.busy ? 'Loading…' : result ? 'Load again' : 'Load extract'}
          </button>
        </div>
      </div>
    </div>
  );
}
