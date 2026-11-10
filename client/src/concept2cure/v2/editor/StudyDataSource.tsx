/**
 * A document's study data, in the one editor (CLAUDE.md RULE 4, 2026-10-31).
 *
 * The study's clinical source is a Vault document (a concept2cure.csr-source.v1 file, or an ADaM bundle manifest
 * naming the study's datasets and approved efficacy output). Here the person chooses it, previews its tables, and
 * freezes the approved version as a source of this document: no Submission Center package run, no filing first.
 * The frozen study data is what the document's build, narratives and assembly read
 * (server/services/csr/csr-study-data.ts).
 *
 * Moved here from Submission Center's CSR card (CsrSourceInputControls), not copied: the picker, the preview,
 * the tables and the response checks are the same code. A failed read is an alert, never an empty list.
 */
import React, { useEffect, useState } from 'react';
import type { CsrSourceReceipt } from '@shared/csr-source-input';
import { apiCall, apiErrorText } from '../apiCall';

const FORMAT = 'concept2cure.csr-source.v1';
/* Each endpoint by its full path, as the launch scope attributes it (ci:launch-scope-api). */
const SOURCES = '/api/submission-orchestrator/csr/sources';
const PREVIEW = '/api/submission-orchestrator/csr/source-preview';
const CONTRACT = '/api/submission-orchestrator/csr/source-contract';
const STUDY_DATA = '/api/submission-orchestrator/csr/study-data';
const RUNS = '/api/submission-orchestrator/runs';
const TABLE_KEYS = ['disposition', 'analysisPopulations', 'demographics', 'primaryEfficacy', 'aeOverallSummary', 'aeBySOC', 'aeTopPT', 'deathsSAEsDiscontinuations'] as const;
interface SourceChoice { documentId: string; documentTitle: string; version: string; sha256: string; approved: boolean }
/** A Vault file the server could not read, so could not check as a clinical source (D2-CSR F5, 2026-11-05). */
interface UnreadFile { documentId: string; documentTitle: string; version: string }
/** The project's clinical sources, the files it could not read, and how many other JSON files are not sources. */
interface SourceList { list: SourceChoice[]; limitReached: boolean; unreadable: UnreadFile[]; notClinicalSources: number }
interface Table { title: string; headers: string[]; rows: string[][] }
type Tables = Record<string, Table>;
interface Preview { source: CsrSourceReceipt; approved: boolean; tables: Tables }
export interface SavedTables { runId: string; programId: string; historical: true; studies: Array<{ source: CsrSourceReceipt; tables: Tables }> }
export interface StudyDataEntry { studyDataId: string; createdAt: string; sources: CsrSourceReceipt[] }

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function isChoice(value: unknown): value is SourceChoice {
  return record(value) && uuid(value.documentId) && text(value.documentTitle) && text(value.version) && sha(value.sha256) && typeof value.approved === 'boolean';
}
function isUnreadFile(value: unknown): value is UnreadFile {
  return record(value) && uuid(value.documentId) && text(value.documentTitle) && typeof value.version === 'string';
}
/** The list the server returns, checked whole. A server before F5 sends neither `unreadable` nor the count: it read no file. */
function sourceList(value: unknown): SourceList | null {
  if (!record(value) || value.format !== FORMAT || typeof value.limitReached !== 'boolean' || !Array.isArray(value.sources) || !value.sources.every(isChoice)) return null;
  const unreadable = value.unreadable ?? [];
  const notClinicalSources = value.notClinicalSources ?? 0;
  if (!Array.isArray(unreadable) || !unreadable.every(isUnreadFile) || !Number.isSafeInteger(notClinicalSources) || (notClinicalSources as number) < 0) return null;
  return { list: value.sources, limitReached: value.limitReached, unreadable, notClinicalSources: notClinicalSources as number };
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
function isEntry(value: unknown): value is StudyDataEntry {
  return record(value) && uuid(value.studyDataId) && text(value.createdAt) && Array.isArray(value.sources) && value.sources.length > 0 && value.sources.every(isReceipt);
}
async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const result = await apiCall<unknown>(method, path, body);
  if (!result.ok || !result.body) throw new Error(apiErrorText(result, 'Clinical source information is unavailable.'));
  return result.body;
}

/**
 * The SHA-256 of each current data-room capture this project uses ("Use in this project", S2). A Vault file with
 * the same bytes is that capture, filed: the chooser lists it first. A failed read only loses that ordering.
 */
async function usedCaptureChecksums(programId: string): Promise<Set<string>> {
  const result = await apiCall<{ evidence?: Array<{ evidence_kind?: string; data_room?: { checksum?: unknown; isCurrent?: unknown } | null }> }>(
    'GET', `/api/c2c/projects/${encodeURIComponent(programId)}/evidence`);
  const rows = result.ok && Array.isArray(result.body?.evidence) ? result.body.evidence : [];
  return new Set(rows.filter(r => r.evidence_kind === 'data_room' && r.data_room?.isCurrent !== false && sha(r.data_room?.checksum))
    .map(r => String(r.data_room?.checksum)));
}

/** The project's used captures first, each list otherwise in the server's order. */
export function usedFirst<T extends { sha256: string }>(list: T[], used: ReadonlySet<string>): T[] {
  return [...list.filter(s => used.has(s.sha256)), ...list.filter(s => !used.has(s.sha256))];
}

/** Frozen clinical tables, checked whole: a document's study data or an earlier package run's, by the same id. */
export async function readSavedClinicalTables(programId: string, runId: string): Promise<SavedTables> {
  const value = await request('GET', `${RUNS}/${encodeURIComponent(runId)}/clinical-tables?programId=${encodeURIComponent(programId)}`);
  if (!isSaved(value, programId, runId)) throw new Error('The saved clinical table response was incomplete.');
  return value;
}

/** The study data frozen for this document, newest first. */
export async function readDocumentStudyData(programId: string, documentId: string): Promise<StudyDataEntry[]> {
  const value = await request('GET', `${STUDY_DATA}?programId=${encodeURIComponent(programId)}&documentId=${encodeURIComponent(documentId)}`);
  if (!record(value) || !Array.isArray(value.studyData) || !value.studyData.every(isEntry)) throw new Error('The document’s study data response was incomplete.');
  return value.studyData;
}

function ClinicalTable({ table }: { table: Table }) {
  const [page, setPage] = useState(0);
  const start = page * 50;
  return <details>
    <summary>{table.title}</summary>
    {/* The product's data table (R-3, rehearsal 2026-11-05: unstyled, the header read "Synthetic LMN201 armSynthetic
        CONTROL armTotal", every column run together). */}
    <div style={{ overflowX: 'auto' }}><table className="reg-tbl">
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

export function SourceTables({ source, tables }: { source: CsrSourceReceipt; tables: Tables }) {
  return <div>
    <p><strong>{source.studyInfo.title}</strong> · {source.protocolNumber} · {source.studyInfo.nctNumber ?? 'no ClinicalTrials.gov number in the source'} · data cut {source.dataCutDate}</p>
    <p>Source: {source.documentTitle}, version {source.version}</p>
    <details><summary>Source fingerprint</summary><code style={{ overflowWrap: 'anywhere' }}>{source.sha256}</code></details>
    {Object.entries(tables).filter((entry): entry is [string, Table] => Boolean(entry[1])).map(([key, table]) => <ClinicalTable key={`${source.sha256}:${key}`} table={table} />)}
  </div>;
}

/** Choose the study's clinical source in this project's Vault, preview its tables, and freeze it for this document. */
export function StudyDataSource({ programId, documentId, onFrozen, onNav }: {
  programId: string; documentId: string; onFrozen: (entry: StudyDataEntry) => void; onNav?: (surface: string) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [sources, setSources] = useState<SourceList | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [choiceId, setChoiceId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<unknown>(null);
  const [used, setUsed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let live = true;
    void usedCaptureChecksums(programId).then(found => { if (live) setUsed(found); }, () => undefined);
    return () => { live = false; };
  }, [programId, refresh]);
  useEffect(() => {
    let live = true;
    setSources(null); setSourcesError(null); setChoiceId(''); setPreview(null); setError(null);
    void request('GET', `${SOURCES}?programId=${encodeURIComponent(programId)}`).then(value => {
      if (!live) return;
      const listed = sourceList(value);
      if (!listed) throw new Error('The clinical source list was incomplete.');
      setSources(listed);
    }).catch(() => { if (live) setSourcesError('The project’s clinical sources could not be listed.'); });
    return () => { live = false; };
  }, [programId, refresh]);
  const choice = sources?.list.find(item => item.documentId === choiceId);
  /* The source file's expected shape, so the person can prepare the study's file before choosing it. */
  const viewFormat = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const data = await request('GET', CONTRACT);
      if (!record(data) || data.format !== FORMAT) throw new Error('The clinical source format response was incomplete.');
      setContract(data);
    } catch { setError('The clinical source format could not be read.'); }
    finally { setBusy(false); }
  };
  const choose = (id: string) => { setChoiceId(id); setPreview(null); setError(null); };
  const previewTables = async () => {
    if (!choice || busy) return;
    setBusy(true); setPreview(null); setError(null);
    try {
      const data = await request('POST', PREVIEW, { programId, documentId: choice.documentId, expectedSha256: choice.sha256 });
      if (!isPreview(data, choice)) throw new Error('The source changed or its preview was incomplete. Reload the sources and retry.');
      setPreview(data);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const freeze = async () => {
    if (!preview?.approved || busy) return;
    setBusy(true); setError(null);
    try {
      const data = await request('POST', STUDY_DATA, { programId, documentId,
        source: { documentId: preview.source.documentId, expectedSha256: preview.source.sha256 } });
      if (!isEntry(data)) throw new Error('The frozen study data response was incomplete.');
      setPreview(null); setChoiceId(''); onFrozen(data);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section aria-label="The study’s clinical source">
    <p>Choose the study’s clinical source in this project’s Vault: a supporting JSON file, or an ADaM bundle manifest that names the study’s ADaM datasets and approved efficacy output. Preview its tables, then freeze the approved version as this document’s study data.</p>
    <p>Review clinical accuracy before use. Structural checks and platform approval do not establish clinical verification or CDISC/FDA qualification.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {onNav && <button type="button" className="btn ghost" disabled={busy} onClick={() => onNav('vault')}>Open the project’s Vault</button>}
      <button type="button" className="btn ghost" disabled={busy} onClick={() => void viewFormat()}>View clinical source format</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Reload clinical sources</button>
    </div>
    {contract !== null && <details open><summary>Clinical source format</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 350, overflow: 'auto' }}>{JSON.stringify(contract, null, 2)}</pre></details>}
    <SourcePicker sources={sources} sourcesError={sourcesError} busy={busy} choiceId={choiceId} choose={choose} used={used} />
    {choice && <button type="button" className="btn ghost" disabled={busy} onClick={() => void previewTables()}>{busy && !preview ? 'Preparing tables…' : 'Preview clinical tables'}</button>}
    {error && <p role="alert">{error}</p>}
    {preview && <SourcePreview preview={preview} busy={busy} freeze={() => void freeze()} />}
  </section>;
}

/** The files the server could not read are named; the other JSON files, counted. Never a silent omission. */
function SourceListNotes({ sources }: { sources: SourceList }) {
  const { unreadable, notClinicalSources: others } = sources;
  const one = unreadable.length === 1;
  const [files, were, them] = one ? ['This Vault file', 'it was', 'it'] : [`These ${unreadable.length} Vault files`, 'they were', 'them'];
  return <>
    {unreadable.length > 0 && <p role="alert">{files} could not be read, so {were} not checked as {one ? 'a clinical source' : 'clinical sources'}:{' '}
      {unreadable.map(file => `${file.documentTitle}, version ${file.version}`).join('; ')}. Check {them} in the project’s Vault, then reload
      clinical sources.</p>}
    {others > 0 && <p>{others === 1 ? '1 other JSON file in this project’s Vault is not a clinical source' : `${others} other JSON files in this project’s Vault are not clinical sources`}{' '}
      (the efficacy results or a dataset a bundle names, for example), so {others === 1 ? 'it is' : 'they are'} not offered.</p>}
    {sources.limitReached && <p>The source list reached its limit. Review the full source inventory in the Vault.</p>}
  </>;
}

function SourcePicker({ sources, sourcesError, busy, choiceId, choose, used }: {
  sources: SourceList | null; sourcesError: string | null; busy: boolean;
  choiceId: string; choose: (id: string) => void; used: ReadonlySet<string>;
}) {
  if (sourcesError) return <p role="alert">{sourcesError}</p>;
  if (!sources) return <p role="status">Listing the project’s clinical sources…</p>;
  if (sources.list.length === 0) return <>
    <p>No clinical source is in this project’s Vault yet. Add the study’s source file there, approve it, then choose it here.</p>
    <SourceListNotes sources={sources} />
  </>;
  return <>
    <label>Clinical source{' '}
      <select className="c2c-input" aria-label="Clinical source" disabled={busy} value={choiceId} onChange={event => choose(event.target.value)}>
        <option value="">Choose a source</option>
        {usedFirst(sources.list, used).map(source => <option key={source.documentId} value={source.documentId}>{source.documentTitle} · v{source.version} · {source.approved ? 'approved' : 'not approved'}{used.has(source.sha256) ? ' · used in this project' : ''}</option>)}
      </select></label>
    <SourceListNotes sources={sources} />
  </>;
}

function SourcePreview({ preview, busy, freeze }: { preview: Preview; busy: boolean; freeze: () => void }) {
  return <div aria-label="Clinical table preview">
    <SourceTables source={preview.source} tables={preview.tables} />
    {preview.approved
      ? <button type="button" className="btn primary" disabled={busy} onClick={freeze}>{busy ? 'Freezing…' : 'Freeze as this document’s study data'}</button>
      : <p>Preview only. Approve this exact source version in the Vault before freezing it as this document’s study data.</p>}
  </div>;
}
