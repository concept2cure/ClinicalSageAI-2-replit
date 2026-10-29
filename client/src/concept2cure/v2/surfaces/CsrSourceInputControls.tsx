import React, { useEffect, useRef, useState } from 'react';
import type { CsrSourceReceipt, CsrSourceSelection } from '@shared/csr-source-input';
import { apiCall, apiErrorText } from '../apiCall';
import { CsrBuildDraftControl } from './CsrBuildProgress';

const FORMAT = 'concept2cure.csr-source.v1';
const SOURCES = '/api/submission-orchestrator/csr/sources';
const PREVIEW = '/api/submission-orchestrator/csr/source-preview';
const CONTRACT = '/api/submission-orchestrator/csr/source-contract';
const RUNS = '/api/submission-orchestrator/runs';
const TABLE_KEYS = ['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations'] as const;
interface SourceChoice { documentId: string; documentTitle: string; version: string; sha256: string; approved: boolean }
interface Table { title: string; headers: string[]; rows: string[][] }
type Tables = Record<string, Table>;
type SourcesState = { programId: string; sources: SourceChoice[]; limitReached: boolean; error?: string };
type SavedState = { programId: string; runId: string; data?: SavedTables; error?: string };
interface Preview { source: CsrSourceReceipt; approved: boolean; tables: Tables }
interface SavedTables { runId: string; programId: string; historical: true; studies: Array<{ source: CsrSourceReceipt; tables: Tables }> }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function isChoice(value: unknown): value is SourceChoice {
  return record(value) && uuid(value.documentId) && text(value.documentTitle) && text(value.version) && sha(value.sha256) && typeof value.approved === 'boolean';
}
function isReceipt(value: unknown): value is CsrSourceReceipt {
  return record(value) && value.adapter === FORMAT && uuid(value.documentId) && text(value.documentTitle) && text(value.version)
    && sha(value.sha256) && text(value.studyId) && text(value.protocolNumber) && text(value.dataCutDate)
    && value.clinicalVerification === 'not-established' && ['canonical-lifecycle', 'not-approved'].includes(String(value.sourceApproval))
    && record(value.studyInfo) && ['title', 'protocolNumber', 'phase', 'indication', 'sponsor', 'investigationalProduct', 'studyDesign', 'primaryEndpoint'].every(key => text(value.studyInfo && (value.studyInfo as Record<string, unknown>)[key]));
}
function isTables(value: unknown): value is Tables {
  return record(value) && TABLE_KEYS.every(key => record(value[key])) && Object.values(value).every(table => {
    if (table === undefined) return true;
    if (!record(table) || !text(table.title)) return false;
    const { headers, rows } = table;
    return Array.isArray(headers) && headers.length > 0 && headers.every(header => typeof header === 'string')
      && Array.isArray(rows) && rows.every(row => Array.isArray(row) && row.length === headers.length && row.every(cell => typeof cell === 'string'));
  });
}
function isPreview(value: unknown, choice: SourceChoice): value is Preview {
  return record(value) && isReceipt(value.source) && value.source.documentId === choice.documentId && value.source.sha256 === choice.sha256
    && value.source.version === choice.version && typeof value.approved === 'boolean'
    && value.approved === (value.source.sourceApproval === 'canonical-lifecycle') && isTables(value.tables);
}
function isSaved(value: unknown, programId: string, runId: string): value is SavedTables {
  return record(value) && value.programId === programId && value.runId === runId && value.historical === true && Array.isArray(value.studies)
    && value.studies.every(study => record(study) && isReceipt(study.source) && study.source.sourceApproval === 'canonical-lifecycle' && isTables(study.tables));
}
async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const result = await apiCall<unknown>(method, path, body);
  if (!result.ok || !result.body) throw new Error(apiErrorText(result, 'Clinical source information is unavailable.'));
  return result.body;
}

function ClinicalTable({ table }: { table: Table }) {
  const [page, setPage] = useState(0);
  const start = page * 50;
  return <details>
    <summary>{table.title}</summary>
    <div style={{ overflowX: 'auto' }}><table>
      <caption>{table.title}</caption>
      <thead><tr>{table.headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead>
      <tbody>{table.rows.slice(start, start + 50).map((row, index) => <tr key={start + index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
    {table.rows.length === 0 && <p>No rows are recorded for this table.</p>}
    {table.rows.length > 50 && <div>
      <span>Rows {start + 1}–{Math.min(start + 50, table.rows.length)} of {table.rows.length} </span>
      <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous rows</button>
      <button type="button" disabled={start + 50 >= table.rows.length} onClick={() => setPage(value => value + 1)}>Next rows</button>
    </div>}
  </details>;
}
function SourceTables({ source, tables }: { source: CsrSourceReceipt; tables: Tables }) {
  return <div>
    <p><strong>{source.studyInfo.title}</strong> · {source.protocolNumber} · data cut {source.dataCutDate}</p>
    <p>Source: {source.documentTitle}, version {source.version}</p>
    <details><summary>Source fingerprint</summary><code style={{ overflowWrap: 'anywhere' }}>{source.sha256}</code></details>
    {Object.entries(tables).filter((entry): entry is [string, Table] => Boolean(entry[1])).map(([key, table]) => <ClinicalTable key={`${source.sha256}:${key}`} table={table} />)}
  </div>;
}

/** Explicit source selection is per new run; saved tables always describe the
 * server's frozen receipt, never whichever document is selected now. */
export function CsrSourceInputControls({ programId, runId, interactionBusy, onSelectionChange, onBusyChange, onNav }: {
  programId: string | null; runId: string | null; interactionBusy: boolean;
  onSelectionChange: (selection: CsrSourceSelection | null) => void;
  onBusyChange: (busy: boolean) => void;
  onNav?: (surface: string) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [sources, setSources] = useState<SourcesState | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [preview, setPreview] = useState<{ programId: string; data: Preview } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [included, setIncluded] = useState(false);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [saved, setSaved] = useState<SavedState | null>(null);
  const [contract, setContract] = useState<unknown>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const scope = useRef(programId); scope.current = programId;
  const ticket = useRef({ value: 0 });
  const selectionHandler = useRef(onSelectionChange); selectionHandler.current = onSelectionChange;
  useEffect(() => { onBusyChange(previewBusy || contractBusy); return () => onBusyChange(false); }, [previewBusy, contractBusy, onBusyChange]);
  useEffect(() => {
    let active = true;
    const counter = ticket.current;
    ++counter.value; setSources(null); setDocumentId(''); setPreview(null); setPreviewError(null); setIncluded(false); setPreviewBusy(false);
    setContract(null); setContractError(null); setContractBusy(false); selectionHandler.current(null);
    if (programId) void request('GET', `${SOURCES}?programId=${encodeURIComponent(programId)}`).then(value => {
      if (!active) return;
      if (!record(value) || value.format !== FORMAT || typeof value.limitReached !== 'boolean' || !Array.isArray(value.sources) || !value.sources.every(isChoice)) throw new Error('The clinical source list was incomplete.');
      setSources({ programId, sources: value.sources, limitReached: value.limitReached });
    }).catch(() => { if (active) setSources({ programId: programId!, sources: [], limitReached: false, error: 'Couldn’t load clinical source documents.' }); });
    return () => { active = false; ++counter.value; };
  }, [programId, refresh]);
  useEffect(() => {
    let active = true; setSaved(null);
    if (programId && runId) void request('GET', `${RUNS}/${encodeURIComponent(runId)}/clinical-tables?programId=${encodeURIComponent(programId)}`).then(value => {
      if (!active) return;
      if (!isSaved(value, programId, runId)) throw new Error('The saved clinical table response was incomplete.');
      setSaved({ programId, runId, data: value });
    }).catch(() => { if (active) setSaved({ programId: programId!, runId: runId!, error: 'Couldn’t read the frozen clinical tables for this run.' }); });
    return () => { active = false; };
  }, [programId, runId, savedRefresh]);
  const activeSources = sources?.programId === programId ? sources : null;
  const activePreview = preview?.programId === programId ? preview.data : null;
  const activeSaved = savedTablesForRun(saved, programId, runId);
  const choice = activeSources?.sources.find(item => item.documentId === documentId);
  const blocked = interactionBusy || previewBusy || contractBusy;
  const choose = (id: string) => { ++ticket.current.value; setDocumentId(id); setPreview(null); setPreviewError(null); setIncluded(false); selectionHandler.current(null); };
  const prepare = async () => {
    if (!programId || !choice || blocked) return;
    const expected = programId; const attempt = ++ticket.current.value;
    setPreviewBusy(true); setPreview(null); setPreviewError(null); setIncluded(false); selectionHandler.current(null);
    try {
      const data = await request('POST', PREVIEW, { programId, documentId: choice.documentId, expectedSha256: choice.sha256 });
      if (scope.current !== expected || ticket.current.value !== attempt) return;
      if (!isPreview(data, choice)) throw new Error('The source changed or its preview was incomplete. Reload source documents and retry.');
      setPreview({ programId: expected, data });
    } catch (error) { if (scope.current === expected && ticket.current.value === attempt) setPreviewError((error as Error).message); }
    finally { if (scope.current === expected && ticket.current.value === attempt) setPreviewBusy(false); }
  };
  const viewContract = async () => {
    if (blocked) return;
    const expected = programId; setContractBusy(true); setContractError(null);
    try {
      const data = await request('GET', CONTRACT);
      if (scope.current !== expected) return;
      if (!record(data) || data.format !== FORMAT) throw new Error('The source format response was incomplete.');
      setContract(data);
    } catch { if (scope.current === expected) setContractError('Couldn’t load the clinical source format.'); }
    finally { if (scope.current === expected) setContractBusy(false); }
  };
  if (!programId) return null;
  return <section aria-label="Clinical source tables">
    <strong>Clinical source tables</strong>
    <p>Choose a supporting JSON document from this project’s Vault, or an ADaM bundle manifest that names the study’s ADaM datasets and approved efficacy output. Preview its tables, then explicitly include an approved source in the next package run.</p>
    <p>Review clinical accuracy before use. Structural checks and platform approval do not establish clinical verification or CDISC/FDA qualification. AI narrative generation remains unavailable.</p>
    <p>These tables are saved with the run for review. They are not automatically placed into an eCTD package.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {onNav && <button type="button" disabled={blocked} onClick={() => onNav('vault')}>Open clinical source Vault</button>}
      <button type="button" disabled={blocked} onClick={() => void viewContract()}>View clinical source format</button>
      <button type="button" disabled={blocked} onClick={() => setRefresh(value => value + 1)}>Reload clinical sources</button>
    </div>
    {contractError && <p role="alert">{contractError}</p>}
    {contract !== null && <details open><summary>Clinical source format</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 350, overflow: 'auto' }}>{JSON.stringify(contract, null, 2)}</pre></details>}
    <ClinicalSourcePicker activeSources={activeSources} blocked={blocked} documentId={documentId} choose={choose} choice={choice} prepare={prepare} previewBusy={previewBusy} />
    {previewError && <p role="alert">{previewError}</p>}
    <ClinicalSourcePreview activePreview={activePreview} blocked={blocked} included={included} setIncluded={setIncluded} onSelectionChange={selectionHandler.current} />
    <FrozenClinicalTables runId={runId} activeSaved={activeSaved} blocked={blocked} onRetry={() => setSavedRefresh(value => value + 1)} onNav={onNav} />
  </section>;
}

function ClinicalSourcePicker({ activeSources, blocked, documentId, choose, choice, prepare, previewBusy }: {
  activeSources: SourcesState | null; blocked: boolean; documentId: string; choose: (id: string) => void;
  choice: SourceChoice | undefined; prepare: () => Promise<void>; previewBusy: boolean;
}) { return <>
    {!activeSources && <p role="status">Loading clinical source documents…</p>}
    {activeSources?.error && <p role="alert">{activeSources.error}</p>}
    {activeSources && !activeSources.error && <>
      {activeSources.sources.length === 0 ? <p>No supporting JSON sources are listed for this project.</p> : <label>Clinical source document <select aria-label="Clinical source document" disabled={blocked} value={documentId} onChange={event => choose(event.target.value)}>
        <option value="">Choose a source</option>
        {activeSources.sources.map(source => <option key={source.documentId} value={source.documentId}>{source.documentTitle} · v{source.version} · {source.approved ? 'approved' : 'not approved'}</option>)}
      </select></label>}
      {activeSources.limitReached && <p>The source list reached its limit. Review the full source inventory in Vault.</p>}
      <button type="button" disabled={!choice || blocked} onClick={() => void prepare()}>{previewBusy ? 'Preparing tables…' : 'Preview clinical tables'}</button>
    </>}
  </>; }
function ClinicalSourcePreview({ activePreview, blocked, included, setIncluded, onSelectionChange }: {
  activePreview: Preview | null; blocked: boolean; included: boolean; setIncluded: (value: boolean) => void;
  onSelectionChange: (selection: CsrSourceSelection | null) => void;
}) { return <>
    {activePreview && <div aria-label="Clinical table preview">
      <SourceTables source={activePreview.source} tables={activePreview.tables} />
      {!activePreview.approved && <p>Preview only. Approve this exact source version in Vault before including it in a package run.</p>}
      <label><input type="checkbox" disabled={!activePreview.approved || blocked} checked={included} onChange={event => {
        const include = event.target.checked && activePreview.approved;
        setIncluded(include); onSelectionChange(include ? { documentId: activePreview.source.documentId, expectedSha256: activePreview.source.sha256 } : null);
      }} /> Include these source tables in the next package run</label>
    </div>}
  </>; }
function FrozenClinicalTables({ runId, activeSaved, blocked, onRetry, onNav }: {
  runId: string | null; activeSaved: SavedState | null; blocked: boolean; onRetry: () => void; onNav?: (surface: string) => void;
}) { return <>
    {runId && <div aria-label="Frozen run clinical tables">
      <h4>Frozen clinical tables for {runId}</h4>
      {!activeSaved && <p role="status">Loading frozen clinical tables…</p>}
      {activeSaved?.error && <p role="alert">{activeSaved.error} <button type="button" disabled={blocked} onClick={onRetry}>Retry frozen clinical tables</button></p>}
      {activeSaved?.data && <>
        <p>Historical source versions are retained with this run. They can differ from the current Vault version.</p>
        {activeSaved.data.studies.length === 0 && <p>This run has no linked clinical source tables.</p>}
        {activeSaved.data.studies.map(study => <SourceTables key={`${study.source.documentId}:${study.source.sha256}`} source={study.source} tables={study.tables} />)}
        <CsrBuildDraftControl programId={activeSaved.programId} runId={activeSaved.runId} studies={activeSaved.data.studies} blocked={blocked} onNav={onNav} />
      </>}
    </div>}
  </>; }

function savedTablesForRun(saved: SavedState | null, programId: string | null, runId: string | null): SavedState | null {
  return saved?.programId === programId && saved.runId === runId ? saved : null;
}
