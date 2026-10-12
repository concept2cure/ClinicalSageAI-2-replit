/**
 * Run history — the governed run record, which no screen read.
 *
 * `GET /api/report-os/runs` has always accepted scope, status, type, search,
 * sort and limit, and enriches each row with its registry label and the
 * region/agency its dependency summary recorded. The canvas only ever POSTed
 * to that route; nothing listed it, so a client could not see what had been
 * run, re-open a sealed report, or gather runs for a bundle.
 *
 * Two honesty rules bind this panel:
 *   - a run with no measured confidence reads "Not measured", never 0%: a
 *     domain register measures none at all (`report-engine.ts`);
 *   - a failed read is a failure with a retry, never an empty history.
 *
 * @module client/src/concept2cure/v2/surfaces/InsightsRunsPanel
 */
import React, { useMemo, useState } from 'react';

import { EmptyState, ErrorState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import {
  RUNS_WINDOW,
  RUN_STATUS_LABEL,
  confidenceText,
  runsSearchCaveat,
  runsUrl,
  whenText,
  type ReportRunRow,
} from './insightsLibraryModel';
import { PanelHead, StatusTag, rowsOf, type LibraryReportType } from './insightsLibraryShared';

/** The filter bar. Every control maps to a parameter the route accepts. */
function RunFilters({
  types,
  status,
  setStatus,
  typeId,
  setTypeId,
  search,
  setSearch,
}: {
  types: LibraryReportType[];
  status: string;
  setStatus: (v: string) => void;
  typeId: string;
  setTypeId: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const statusId = React.useId();
  const typeFilterId = React.useId();
  const searchId = React.useId();
  return (
    <div className="rl-filters">
      <div className="rl-filter">
        <label className="gov-label" htmlFor={statusId}>Status</label>
        <select id={statusId} className="rl-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {Object.entries(RUN_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="rl-filter">
        <label className="gov-label" htmlFor={typeFilterId}>Report type</label>
        <select id={typeFilterId} className="rl-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Any type</option>
          {types.map((t) => (
            <option key={t.typeId} value={t.typeId}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="rl-filter">
        <label className="gov-label" htmlFor={searchId}>Search</label>
        <input
          id={searchId}
          className="rl-input"
          type="search"
          value={search}
          placeholder="Run id, scope, market"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </div>
  );
}

function RunRow({
  run,
  pickable,
  picked,
  onToggle,
  onOpen,
}: {
  run: ReportRunRow;
  pickable: boolean;
  picked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const market = [run.regionCode, run.agency].filter(Boolean).join(' · ');
  return (
    <tr>
      {pickable ? (
        <td>
          <input
            type="checkbox"
            checked={picked}
            onChange={onToggle}
            aria-label={`Include the ${run.reportTypeLabel} run of ${whenText(run.createdAt)} in a bundle`}
          />
        </td>
      ) : null}
      <td>
        {run.reportTypeLabel}
        {market ? <div className="rl-cell-sub">{market}</div> : null}
      </td>
      <td>{run.scopeType} — {run.scopeId}</td>
      <td><StatusTag status={run.status} /></td>
      <td>{confidenceText(run.confidence)}</td>
      <td>{whenText(run.completedAt ?? run.createdAt)}</td>
      <td>
        <button type="button" className="rc-chip" onClick={onOpen}>Open</button>
      </td>
    </tr>
  );
}

export function RunsPanel({
  types,
  onOpen,
  onBundle,
  canBundle,
}: {
  types: LibraryReportType[];
  onOpen: (run: ReportRunRow) => void;
  onBundle: (runIds: number[]) => void;
  canBundle: boolean;
}) {
  const [status, setStatus] = useState('');
  const [typeId, setTypeId] = useState('');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);

  const url = runsUrl({
    ...(status ? { status } : {}),
    ...(typeId ? { reportTypeId: typeId } : {}),
    ...(search.trim() ? { search } : {}),
    sortBy: 'createdAt',
    sortOrder: 'desc',
    // The widest window the route serves: it filters and sorts in memory after
    // the SQL limit, so the window IS the search's reach (see RUNS_WINDOW).
    limit: RUNS_WINDOW,
  });
  const runs = useLiveData<unknown>(url, [url, attempt]);
  const rows = useMemo(() => rowsOf<ReportRunRow>(runs.data), [runs.data]);
  const filtered = Boolean(status || typeId || search.trim());
  /* A truncated search presented as a complete one is a silent cap, so the
     panel says what the answer covered whenever it could be partial. */
  const caveat = runsSearchCaveat(rows.length, { searching: Boolean(search.trim()), sorted: false });

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="rl">
      <PanelHead
        title="Run history"
        sub="Every governed report run this organization has made, newest first. A run is an immutable record; opening one shows the document it produced."
        actions={
          picked.length > 0 && canBundle ? (
            <button type="button" className="btn primary" onClick={() => onBundle(picked)}>
              {I.layers} Bundle {picked.length} report{picked.length === 1 ? '' : 's'}
            </button>
          ) : null
        }
      />

      <RunFilters
        types={types}
        status={status}
        setStatus={setStatus}
        typeId={typeId}
        setTypeId={setTypeId}
        search={search}
        setSearch={setSearch}
      />

      {caveat && (
        <div className="ro-dash-note" role="status" data-testid="rl-runs-caveat">
          {I.info} {caveat}
        </div>
      )}

      <RunsBody
        loading={runs.loading}
        failed={Boolean(runs.error)}
        filtered={filtered}
        rows={rows}
        canBundle={canBundle}
        picked={picked}
        onToggle={toggle}
        onOpen={onOpen}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}

/** The three honest outcomes of the read, and the table when there is one. */
function RunsBody({
  loading,
  failed,
  filtered,
  rows,
  canBundle,
  picked,
  onToggle,
  onOpen,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  filtered: boolean;
  rows: ReportRunRow[];
  canBundle: boolean;
  picked: number[];
  onToggle: (id: number) => void;
  onOpen: (run: ReportRunRow) => void;
  onRetry: () => void;
}) {
  if (loading) return <EmptyState busy icon={I.history} title="Reading the run history…" />;
  if (failed) {
    return (
      <ErrorState
        title="Couldn't read the run history"
        message="The governed run records could not be read. Nothing is shown in their place."
        retry={onRetry}
        testId="rl-runs-error"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={I.history}
        title={filtered ? 'No run matches these filters' : 'No reports have been run yet'}
        hint={
          filtered
            ? 'Clear the filters to see every run.'
            : 'Run a report from the catalog and it is recorded here, with its status, scope and the document it produced.'
        }
        testId="rl-runs-empty"
      />
    );
  }
  return (
    <table className="ro-table rl-table">
      <caption className="rl-cap">{rows.length} run{rows.length === 1 ? '' : 's'}</caption>
      <thead>
        <tr>
          {canBundle ? <th scope="col" className="rl-pick-h">Bundle</th> : null}
          <th scope="col">Report</th>
          <th scope="col">Scope</th>
          <th scope="col">Status</th>
          <th scope="col">Confidence</th>
          <th scope="col">Run</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <RunRow
            key={r.id}
            run={r}
            pickable={canBundle}
            picked={picked.includes(r.id)}
            onToggle={() => onToggle(r.id)}
            onOpen={() => onOpen(r)}
          />
        ))}
      </tbody>
    </table>
  );
}
