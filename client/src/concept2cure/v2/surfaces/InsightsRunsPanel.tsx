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
import React, { useEffect, useMemo, useState } from 'react';

import { EmptyState, ErrorState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import {
  RUN_STATUS_LABEL,
  confidenceText,
  runsUrl,
  whenText,
  type ReportRunRow,
} from './insightsLibraryModel';
import {
  PanelHead,
  StatusTag,
  isRowList,
  readFailureOf,
  rowsOf,
  type LibraryReportType,
  type ReadFailure,
} from './insightsLibraryShared';

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
      <td>{run.scopeLabel || `${run.scopeType} — ${run.scopeId}`}{run.computedScope === 'organization' && <div className="rl-cell-sub">Organization-wide records</div>}</td>
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
  scope,
}: {
  types: LibraryReportType[];
  onOpen: (run: ReportRunRow) => void;
  onBundle: (runIds: number[]) => void;
  canBundle: boolean;
  scope?: { scopeType: string; scopeId: string; label?: string } | null;
}) {
  const [status, setStatus] = useState('');
  const [typeId, setTypeId] = useState('');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [offset, setOffset] = useState(0);
  const [currentScope, setCurrentScope] = useState(false);
  const [sortBy, setSortBy] = useState<'createdAt' | 'completedAt' | 'confidence' | 'status' | 'reportType' | 'scopeType'>('createdAt');
  const pageSize = 50;
  useEffect(() => { setOffset(0); setPicked([]); }, [status, typeId, search, currentScope, scope?.scopeType, scope?.scopeId, sortBy]);

  const url = runsUrl({
    ...(status ? { status } : {}),
    ...(typeId ? { reportTypeId: typeId } : {}),
    ...(search.trim() ? { search } : {}),
    ...(currentScope && scope ? { scopeType: scope.scopeType, scopeId: scope.scopeId } : {}),
    sortBy,
    sortOrder: 'desc',
    limit: pageSize,
    offset,
  });
  const runs = useLiveData<unknown>(url, [url, attempt], isRowList);
  const rows = useMemo(() => rowsOf<ReportRunRow>(runs.data), [runs.data]);
  const filtered = Boolean(status || typeId || search.trim());

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="rl">
      <PanelHead
        title="Run history"
        sub="The governed reports you can access, newest first. A run retains the document it produced; opening one shows that saved record."
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
      <HistoryControls scopeLabel={scope?.label} scopeAvailable={Boolean(scope)} currentScope={currentScope} onScope={setCurrentScope} sortBy={sortBy} onSort={setSortBy} onRefresh={() => setAttempt(n => n + 1)} />
      <HistoryPageInfo read={runs} offset={offset} count={rows.length} />

      <RunsBody
        loading={runs.loading}
        failure={runs.error ? readFailureOf(runs, 'the run history') : null}
        filtered={filtered}
        rows={rows}
        canBundle={canBundle}
        picked={picked}
        onToggle={toggle}
        onOpen={onOpen}
        onRetry={() => setAttempt((n) => n + 1)}
      />
      <HistoryPagination read={runs} offset={offset} pageSize={pageSize} onOffset={setOffset} />
    </div>
  );
}

type HistorySort = 'createdAt' | 'completedAt' | 'confidence' | 'status' | 'reportType' | 'scopeType';
type HistoryRead = { loading: boolean; error?: string; meta?: Record<string, unknown> };
function HistoryControls({ scopeLabel, scopeAvailable, currentScope, onScope, sortBy, onSort, onRefresh }: { scopeLabel?: string; scopeAvailable: boolean; currentScope: boolean; onScope: (v: boolean) => void; sortBy: HistorySort; onSort: (v: HistorySort) => void; onRefresh: () => void }) {
  const scopeId = React.useId();
  const sortId = React.useId();
  return <div className="rl-filters">
    {scopeAvailable && <div className="rl-filter"><label className="gov-label" htmlFor={scopeId}>Reporting scope</label><select id={scopeId} className="rl-input" value={currentScope ? 'current' : 'all'} onChange={e => onScope(e.target.value === 'current')}><option value="all">All accessible reports</option><option value="current">{scopeLabel || 'Selected project'}</option></select></div>}
    <div className="rl-filter"><label className="gov-label" htmlFor={sortId}>Order by</label><select id={sortId} className="rl-input" value={sortBy} onChange={e => onSort(e.target.value as HistorySort)}><option value="createdAt">Newest first</option><option value="completedAt">Most recently computed</option><option value="confidence">Highest measured confidence</option><option value="reportType">Report type</option><option value="status">Status</option></select></div>
    <button type="button" className="btn ghost" onClick={onRefresh}>Refresh</button>
  </div>;
}
function HistoryPageInfo({ read, offset, count }: { read: HistoryRead; offset: number; count: number }) {
  if (read.loading || read.error) return null;
  if (typeof read.meta?.total === 'number') return <div className="rl-sub" role="status">{read.meta.total} matching reports · {count ? `${offset + 1}–${offset + count}` : '0'} shown</div>;
  return <div className="ro-dash-note" role="status">{I.info} The report register did not state whether more matching records exist. This list may be incomplete; refresh to check again.</div>;
}
function HistoryPagination({ read, offset, pageSize, onOffset }: { read: HistoryRead; offset: number; pageSize: number; onOffset: (offset: number) => void }) {
  const hasMore = read.meta?.hasMore === true;
  if (read.loading || read.error || (!offset && !hasMore)) return null;
  return <div className="rl-pagination" role="group" aria-label="Report history pages"><button type="button" className="btn ghost" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - pageSize))}>Previous</button><span>Page {Math.floor(offset / pageSize) + 1}</span><button type="button" className="btn ghost" disabled={!hasMore} onClick={() => onOffset(offset + pageSize)}>Next</button></div>;
}

/** The three honest outcomes of the read, and the table when there is one. */
function RunsBody({
  loading,
  failure,
  filtered,
  rows,
  canBundle,
  picked,
  onToggle,
  onOpen,
  onRetry,
}: {
  loading: boolean;
  failure: ReadFailure | null;
  filtered: boolean;
  rows: ReportRunRow[];
  canBundle: boolean;
  picked: number[];
  onToggle: (id: number) => void;
  onOpen: (run: ReportRunRow) => void;
  onRetry: () => void;
}) {
  if (loading) return <EmptyState busy icon={I.history} title="Reading the run history…" />;
  if (failure) {
    /* A refusal offers no retry: the server answered, and clicking again gets
       the same answer. Only an unreached server or a 5xx is retryable. */
    return (
      <ErrorState
        title={failure.title}
        message={failure.message}
        {...(failure.retryable ? { retry: onRetry } : {})}
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
