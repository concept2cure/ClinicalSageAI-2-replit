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
import { ErrorState, useLiveRows } from '../dataConnect';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { useRbmMutation, rbmWrite } from './rbmWrites';

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
  /** Present when the extract carried site rows: the study's sites were rescored from them, or why they were not. */
  siteRisk?: { rescored: number; source: string } | { notRescored: string };
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
        {result.siteRisk && 'rescored' in result.siteRisk && (
          <> · site risk rescored for {result.siteRisk.rescored} site{result.siteRisk.rescored === 1 ? '' : 's'}</>
        )}
      </div>
      {result.siteRisk && 'notRescored' in result.siteRisk && (
        <div className="rbm-ingest-warn">
          {I.alertTriangle}<b>Site risk was not rescored from this load.</b> {result.siteRisk.notRescored} The site rows are stored; use “Recompute site risk” on Site risk once this is resolved.
        </div>
      )}
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
/** One recorded load (a row of GET /api/mdx/rbm-data-runs, as the store keeps it). */
interface DataRun {
  id: number; source: string; source_ref: string | null; data_cutoff: string | null; status: string;
  rows_accepted: number; rows_rejected: number; started_at: string | null;
  supersedes_run_id: number | null; superseded_at: string | null; reprocess_reason: string | null; error: string | null;
}
/** A malformed history is reported as a failed read, never shown as "no loads". */
function isDataRuns(value: unknown): value is DataRun[] {
  return Array.isArray(value) && value.every((r: DataRun) => r && typeof r.id === 'number' && typeof r.source === 'string' && typeof r.status === 'string');
}
const RUN_OUTCOME: Record<string, string> = { succeeded: 'Loaded', partial: 'Loaded, some rows rejected', failed: 'Failed', running: 'Running' };

/**
 * The study's earlier loads, newest first: which feed, the date the extract represents, what landed and what was
 * refused, and whether a later load replaced it and why. The server has kept this for every load since loads were
 * recorded (`rbm_data_runs`, read by GET /rbm-data-runs) and no screen showed it: the overview said only how old
 * each feed's newest load was. A read that fails says so; it is not an empty history.
 */
export function RbmLoadHistory({ programId, after }: { programId: string; after?: { runId?: number } | null }) {
  // Read again once a load has landed, so the load just made is in the list.
  const runs = useLiveRows<DataRun>(`/api/mdx/rbm-data-runs?program_id=${programId}`, [programId, after?.runId], isDataRuns);
  return (
    <div className="rbm-ingest-hist">
      <div className="rbm-ingest-rejects-h">Earlier loads</div>
      {runs.loading ? <div role="status" className="rbm-ingest-more">Reading the load history…</div>
        : runs.error ? <ErrorState variant="inline" title="The load history could not be read" message="Nothing is shown in its place. The loads themselves are unaffected." />
        : runs.rows.length === 0 ? <div className="rbm-ingest-more">No extract has been loaded for this study yet.</div>
        : (
          <table className="rbm-tbl">
            <caption className="rbm-sr">Every extract loaded for this study, newest first</caption>
            <thead><tr><th scope="col">Run</th><th scope="col">Loaded</th><th scope="col">Feed</th><th scope="col">Data cut-off</th><th scope="col">Rows</th><th scope="col">Outcome</th></tr></thead>
            <tbody>{runs.rows.map(r => (
              <tr key={r.id} data-superseded={r.superseded_at ? '' : undefined}>
                <th scope="row" className="mono">{r.id}</th>
                <td>{r.started_at ? <GovernedTimestamp value={r.started_at} layout="inline" /> : <span className="mut">—</span>}</td>
                <td>{SOURCE_LABEL[r.source] ?? r.source}{r.source_ref ? <span className="rbm-owner">{r.source_ref}</span> : null}</td>
                <td className="mono">{r.data_cutoff ? String(r.data_cutoff).slice(0, 10) : <span className="mut">Not stated</span>}</td>
                <td className="mono">{r.rows_accepted} accepted{r.rows_rejected ? `, ${r.rows_rejected} rejected` : ''}</td>
                <td>
                  {RUN_OUTCOME[r.status] ?? r.status}
                  {r.error ? <span className="rbm-owner">{r.error}</span> : null}
                  {r.supersedes_run_id != null ? <span className="rbm-owner">Replaced run {r.supersedes_run_id}{r.reprocess_reason ? `: ${r.reprocess_reason}` : ''}</span> : null}
                  {r.superseded_at ? <span className="rbm-owner">Replaced by a later load; its readings were retracted</span> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
    </div>
  );
}

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
  const currentRead = useRef<FileReader | null>(null);
  const fileChoice = useRef<HTMLInputElement>(null);
  const writing = useRef(false);
  const needsReload = useRef(false);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // A refusal because this exact extract is already loaded. Held apart from
  // mut.error so the reprocess path is offered in place, with the operator's
  // file and cutoff still in the form, instead of reading as a dead end.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [reprocessReason, setReprocessReason] = useState('');
  // A board refresh unmounts this modal. Let the operator read the saved
  // outcome or duplicate warning, then refresh when the modal is dismissed.
  const mut = useRbmMutation();
  const closeDialog = () => {
    if (writing.current) return;
    const refresh = needsReload.current;
    needsReload.current = false;
    onClose();
    if (refresh) onReload?.();
  };

  const cancelRead = useCallback(() => {
    const reader = currentRead.current;
    currentRead.current = null;
    if (reader?.readyState === FileReader.LOADING) reader.abort();
  }, []);
  useEffect(() => cancelRead, [cancelRead]);

  const clearOutcome = () => {
    setResult(null); setDuplicate(null); setReprocessReason('');
    setFileError(null); mut.clearError();
  };
  const clearFileChoice = () => {
    setFileName(null);
    if (fileChoice.current) fileChoice.current.value = '';
  };
  const readFile = (file: File | undefined) => {
    if (!file) return;
    cancelRead(); clearOutcome(); setCsv(''); setReading(true);
    setFileName(file.name);
    const reader = new FileReader();
    currentRead.current = reader;
    reader.onload = () => {
      if (currentRead.current !== reader) return;
      currentRead.current = null; setReading(false);
      setCsv(String(reader.result ?? ''));
    };
    const failed = () => {
      if (currentRead.current !== reader) return;
      currentRead.current = null; setReading(false); clearFileChoice();
      setFileError('The selected file could not be read. Choose it again or paste its rows.');
    };
    reader.onerror = failed; reader.onabort = failed;
    try { reader.readAsText(file); } catch { failed(); }
  };

  /**
   * Load the extract. `reprocess` is only ever set by the operator explicitly
   * accepting the duplicate warning — a retry must never silently become a
   * second load, because a second load appends KRI readings.
   */
  const submit = (reprocess = false) => {
    if (currentRead.current || writing.current || !csv.trim()) return;
    writing.current = true; setResult(null);
    return mut.run(async () => {
    try {
      const data = await rbmWrite<IngestResult>('POST', '/rbm-metric-ingest', {
        programId,
        source,
        sourceRef: fileName,
        dataCutoff: cutoff || null,
        csv,
        ...(reprocess ? { reprocess: true, reprocessReason: reprocessReason.trim() } : {}),
      });
      needsReload.current = true;
      setDuplicate(null);
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The server's 409 names the run that already holds this content.
      if (/already loaded/i.test(msg)) {
        setDuplicate(msg);
        return;
      }
      throw err;
    }
    }).finally(() => { writing.current = false; });
  };

  /* Declared the role but had no Escape and never moved focus into the panel
     or back to the opener; the semantics also sat on the scrim, not the panel. */
  const dialogRef = useDialog(closeDialog);

  return (
    <div className="rbm-modal-scrim">
      <div
        className="rbm-modal rbm-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Load a metric extract"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="rbm-modal-h">{I.database}<span>Load a metric extract</span></div>
        <div className="rbm-modal-what">
          Land measurements against this study. Study-scope rows update the KRI or QTL whose
          name they match; subject-scope rows feed the patient cohort scoring. Every row is
          validated server-side and anything unusable comes back with a reason.
        </div>

        <label className="rbm-field"><span>Source feed</span>
          <select value={source} disabled={mut.busy} onChange={e => { clearOutcome(); setSource(e.target.value); }}>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>

        <label className="rbm-field"><span>Data cutoff</span>
          <input type="date" value={cutoff} disabled={mut.busy} onChange={e => { clearOutcome(); setCutoff(e.target.value); }} />
          <em className="rbm-field-hint">
            The date the extract represents, not today. Freshness is measured from this — an
            export pulled weeks ago does not become current by being loaded now.
          </em>
        </label>

        <label className="rbm-field"><span>Extract file</span>
          <input ref={fileChoice} type="file" accept=".csv,.tsv,.txt,text/csv" disabled={mut.busy}
            onChange={e => readFile(e.target.files?.[0])} />
          <em className="rbm-field-hint">
            Header row required. Columns: <span className="mono">{TEMPLATE}</span>. Only
            <span className="mono"> metric_key</span> and a value (or a numerator/denominator pair) are
            mandatory; <span className="mono">scope_level</span> defaults to study.
          </em>
        </label>

        {reading && <div role="status">Reading the selected file…</div>}
        {fileError && <ErrorState variant="inline" title="Extract file could not be read" message={fileError} />}
        <label className="rbm-field"><span>…or paste the rows</span>
          <textarea rows={5} value={csv} disabled={mut.busy}
            placeholder={`${TEMPLATE}\nQuery rate,study,,12.5,,,%,2026-07-20`}
            onChange={e => {
              cancelRead(); clearOutcome(); setReading(false);
              setCsv(e.target.value); clearFileChoice();
            }} />
        </label>

        {mut.error && (
          <ErrorState
            variant="inline"
            title="The change was not saved"
            message={mut.error}
            onDismiss={mut.clearError}
          />
        )}
        {duplicate && !result && (
          <div className="rbm-modal-note" role="alert">
            <b>Already loaded.</b> {duplicate}
            <label className="rbm-field" style={{ marginTop: 8 }}>
              <span>Reason for reprocessing</span>
              <textarea rows={2} value={reprocessReason} disabled={mut.busy}
                placeholder="e.g. the unit mapping for query_rate was corrected"
                onChange={e => setReprocessReason(e.target.value)} />
              <em className="rbm-field-hint">
                Reprocessing supersedes the earlier run and retracts the readings it appended, so
                the history is replaced rather than doubled. The earlier run stays on file, with
                this reason recorded against its replacement.
              </em>
            </label>
            <button className="rbm-btn" disabled={mut.busy || reading || reprocessReason.trim().length < 3}
              onClick={() => submit(true)}>
              {mut.busy ? 'Reprocessing…' : 'Reprocess and replace that run'}
            </button>
          </div>
        )}
        {result && <IngestOutcome result={result} />}

        <RbmLoadHistory programId={programId} after={result} />

        <div className="rbm-modal-note">
          The run is recorded with its source, cutoff and row counts. That provenance is what
          lets the board say how current each indicator's data is — an indicator is not
          evidence of control without it.
        </div>
        <div className="rbm-modal-acts">
          <button className="rbm-btn" onClick={closeDialog} disabled={mut.busy}>{result ? 'Close' : 'Cancel'}</button>
          <button className="rbm-btn pri" disabled={mut.busy || reading || !csv.trim()} onClick={() => { setDuplicate(null); submit(); }}>
            {mut.busy ? 'Loading…' : result ? 'Load again' : 'Load extract'}
          </button>
        </div>
      </div>
    </div>
  );
}
