/**
 * The trial master file of a project's study: the section the Vault's Required
 * documents view will hold.
 *
 * The founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere." The
 * eTMF lives inside the Vault and files against the project's protocol-design
 * study (P-74, P-75; docs/design/ETMF_CONVERGENCE_2026-10-30.md). It is a
 * section, split out of the Vault: not a tab, a screen, a card or a surface id
 * (RULE 4). Until the eTMF is admitted to the Vault app the Vault may not call
 * /api/etmf, so the `etmf` surface hosts it (surfaces/Etmf.tsx, one client of
 * these routes). At admission the Vault renders it after VaultCoverage, and
 * its header button calls `revealVaultTrialMasterFile`
 * (docs/evidence/D2-ETMF/2026-11-10-vault-section/).
 *
 * GET    /api/study-design?program_id=<project>                    the project's studies
 * GET    /api/etmf/trials/:studyId/completeness?scope=essential    the verdict and the zones
 * GET    /api/etmf/trials/:studyId/artifacts                       each filing and its document
 * POST   /api/etmf/trials/:studyId/artifacts  { artifactCode, documentRef, reason }
 * DELETE /api/etmf/artifacts/:id              { reason }
 * GET    /api/etmf/trials/:studyId/inspection-package?scope=essential
 *
 * In words first: which study, whether its essential records are all filed,
 * then each zone with what is filed and what is missing, by the record's name
 * in the one catalog (shared/constants/domain/tmf-reference-model.ts). A
 * verdict the server could not determine is said as not determined. A read
 * that failed or was refused is said as that, through the one read classifier,
 * and is never an empty trial master file. A record is filed against a version
 * chosen from this project's Vault, never against a reference made up here,
 * and with a reason; a filing is removed with a reason. Both are offered only
 * to a role that may write the Vault. Nothing is read until the view that
 * holds the section is first on screen.
 */
import React, { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
// The completeness response, typed by the service that computes it.
import type { TmfCompletenessResult, TmfUnverifiedEvidence, ZoneCompleteness } from '../../../../../server/services/etmf/tmf-completeness';
import { describeReadFailure, readFailureFor } from '../../mdx/hooks/useFetchJson';
import type { StudyDesignRow } from '../../mdx/hooks/useStudyDesign';
import { assessmentStateFor, mayReassure } from '../assessmentState';
import { useLiveData, type DataState, type ShapeGuard } from '../dataConnect';
import { downloadBlob, safeFileName } from '../download';
import { VaultVersionPicker, type PickedVaultVersion } from './VaultLibraryResults';
import { VaultViewOnly, useVaultCanWrite } from './VaultViewOnly';
import { sha256Hex } from './vaultArchiveDownload';

export const VAULT_TMF_SECTION_ID = 'vault-trial-master-file';

/**
 * Bring the section into view, for the Vault's header button once the section
 * is in Required documents. Deferred one task, so the view the caller has just
 * asked for is on screen first.
 */
export function revealVaultTrialMasterFile(): void {
  setTimeout(() => {
    const section = document.getElementById(VAULT_TMF_SECTION_ID);
    if (!section) return;
    if (typeof section.scrollIntoView === 'function') section.scrollIntoView({ block: 'start' });
    section.focus({ preventScroll: true });
  }, 0);
}

/** A document of this project's Vault as its host lists it: a second way to name what a record is filed against. */
export interface TmfVaultDocument { docId: string; title: string }
const NO_DOCUMENTS: readonly TmfVaultDocument[] = [];

type Study = Pick<StudyDesignRow, 'studyId' | 'title' | 'phase'>;
/** A filing as GET /api/etmf/trials/:studyId/artifacts lists it, with the document the server found for its reference. */
interface Filing {
  id: string; artifactCode: string; documentRef: string | null; filedAt?: string | null;
  document?: { id: string; title: string | null; version: string | null; current: boolean } | null;
}
type Note = { tone: 'ok' | 'error'; text: string };
type RecordState = 'filed' | 'missing' | TmfUnverifiedEvidence;
interface TmfRecord { code: string; name: string; state: RecordState; filing: Filing | null }
export type TmfVerdict = 'complete' | 'incomplete' | 'undetermined' | 'not-assessed';

/** What the section is showing, as it was read: for a host that tells AnA what is on screen (the eTMF page). */
export type TmfSectionState =
  | { study: null; studies: DataState<{ designs: Study[] }> }
  | { study: Study; completeness: DataState<TmfCompletenessResult> };
const HostContext = React.createContext<{ heading: string; onState?: (state: TmfSectionState) => void }>({ heading: 'Trial master file' });

/** Tell the host what is on screen, when it changes. Null: a part deeper in the section is telling it. */
function useTellHost(state: TmfSectionState | null): void {
  const { onState } = useContext(HostContext);
  const latest = useRef(state);
  latest.current = state;
  const key = JSON.stringify(state);
  useEffect(() => { if (latest.current) onState?.(latest.current); }, [key, onState]);
}

const SESSION_EXPIRED = 'Your session has expired. Sign in again.';
const PACKAGE_FAILED = 'The inspection package was not downloaded.';
const VAULT_REF = /^vault:\/\/(.+)$/;
const tmfBase = (studyId: string) => `/api/etmf/trials/${encodeURIComponent(studyId)}`;
const studyLabel = (s: Study) => [s.title?.trim(), s.phase ? `Phase ${s.phase}` : ''].filter(Boolean).join(' · ') || s.studyId;
const are = (n: number) => (n === 1 ? 'is' : 'are');

/* ── What the reads must carry. A 200 that is not the shape is a failed read, never an empty one. ── */

const isStudyList: ShapeGuard<{ designs: Study[] }> = (v): v is { designs: Study[] } => {
  const designs = (v as { designs?: unknown } | null)?.designs;
  return Array.isArray(designs) && designs.every((d) => typeof d?.studyId === 'string' && d.studyId.trim() !== '');
};
const isCodes = (v: unknown): v is string[] => Array.isArray(v) && v.every((c) => typeof c === 'string');
function isZone(v: unknown): v is ZoneCompleteness {
  const z = v as Partial<ZoneCompleteness> | null;
  return !!z && typeof z.number === 'number' && typeof z.name === 'string' &&
    isCodes(z.required) && isCodes(z.present) && isCodes(z.missing) && Array.isArray(z.unverified);
}
/** `ready` must be stated: true, false or null (not determined). An absent one is not an answer. */
const isCompleteness: ShapeGuard<TmfCompletenessResult> = (v): v is TmfCompletenessResult => {
  const r = v as Partial<TmfCompletenessResult> | null;
  const s = r?.summary as Record<string, unknown> | undefined;
  return !!r && (r.ready === null || typeof r.ready === 'boolean') && Array.isArray(r.zones) && r.zones.every(isZone) &&
    !!s && ['zoneCount', 'totalRequired', 'totalMissing'].every((k) => Number.isSafeInteger(s[k]));
};
/** The answer names the study it is about (`study`, since 2026-11-10). One that names another study is not this study's answer. */
function isAboutStudy(result: TmfCompletenessResult, studyId: string): boolean {
  const named = (result as { study?: { studyId?: unknown } }).study?.studyId;
  return named === undefined || named === studyId;
}
const isFilingList: ShapeGuard<Filing[]> = (v): v is Filing[] =>
  Array.isArray(v) && v.every((f) => typeof f?.id === 'string' && f.id !== '' && typeof f.artifactCode === 'string' &&
    (f.documentRef == null || typeof f.documentRef === 'string'));

/* ── A read or a request that returned nothing, said as what it was ── */

/** A read's failure in words: a refusal through the one read classifier, or a failure that is not an empty answer. */
function readFailure(
  read: Pick<DataState<unknown>, 'status' | 'code'>,
  words: { what: string; failed: string; subject: string },
): { message: string; retryable: boolean } {
  if (read.status === 401) return { message: `Your session has expired. Sign in again to read ${words.what}.`, retryable: false };
  const kind = readFailureFor(read.status, read.code);
  if (kind === 'failed') return { message: words.failed, retryable: true };
  const said = describeReadFailure(kind, words.what, { subject: words.subject });
  return { message: said.message, retryable: said.retryable };
}
const STUDIES_READ = { what: 'this project’s studies', subject: 'this project',
  failed: 'This project’s studies could not be read. This does not mean the project has no study.' };
const TMF_READ = { what: 'the trial master file', subject: 'this study',
  failed: 'The trial master file could not be read. This is not an empty trial master file.' };
const FILINGS_READ = { what: 'the list of filings', subject: 'this study', failed: 'The list of filings could not be read.' };
const FILINGS_UNREAD = 'The document each record is filed against is not shown, and a filing cannot be removed here.';

/**
 * A request the server did not carry out. `refused`: it answered and said no,
 * so nothing changed. Otherwise no verdict arrived (a dropped connection, a
 * server error) and a write may have been recorded.
 */
function requestFailure(e: unknown): { refused: boolean; words: string } {
  const { status, code, payload } = (e ?? {}) as { status?: unknown; code?: unknown; payload?: unknown };
  if (typeof status !== 'number' || status <= 0) return { refused: false, words: 'The server did not answer.' };
  const kind = readFailureFor(status, typeof code === 'string' ? code : undefined);
  const refused = status < 500;
  if (kind === 'failed') return { refused, words: redactInternals(serverMessage(payload), `The server answered HTTP ${status}.`) };
  if (kind !== 'not-found') return { refused, words: `${describeReadFailure(kind, 'it').title}.` };
  if (code === 'STUDY_NOT_FOUND') return { refused, words: 'This study was not found in your organization.' };
  return { refused, words: redactInternals(serverMessage(payload), 'It was not found in your organization.') };
}

/** A governed write that did not succeed. `unknown`: it may have been recorded. */
class TmfWriteError extends Error {
  constructor(message: string, readonly unknown: boolean) { super(message); this.name = 'TmfWriteError'; }
}

async function governedWrite(method: 'POST' | 'DELETE', path: string, body: unknown, words: { refused: string; unknown: string }): Promise<void> {
  let res: Response;
  try {
    res = await apiRequest(method, path, body);
  } catch (e) {
    const failure = requestFailure(e);
    throw failure.refused ? new TmfWriteError(`${words.refused} ${failure.words}`, false) : new TmfWriteError(words.unknown, true);
  }
  // apiRequest resolves a 401 instead of throwing it.
  if (!res.ok) throw new TmfWriteError(`${words.refused} ${res.status === 401 ? SESSION_EXPIRED : `The server answered HTTP ${res.status}.`}`, false);
}
/** What a write says when it was refused (nothing changed), and when no answer came (it may have been recorded). */
const writeWords = (done: string, act: string, doing: string) => ({
  refused: `Nothing was ${done}.`,
  unknown: `The server did not confirm the ${act}, so it is not known whether it was recorded. The trial master file was read again: check the record below before ${doing} it again.`,
});
const FILE_WORDS = writeWords('filed', 'filing', 'filing');
const REMOVE_WORDS = writeWords('removed', 'removal', 'removing');

/* ── The inspection package ── */

function packageSaved(ready: string | null, stated: string, received: string | null): string {
  const says = ready === 'true' ? ' It records every essential record as filed.'
    : ready === 'undetermined' ? ' It records the verdict as not determined.'
      : ready === 'false' ? ' It records essential records still missing.' : '';
  const hash = !stated ? ' The server did not state its SHA-256.'
    : received === null ? ` SHA-256 stated by the server: ${stated}. This browser could not check it.`
      : ` Its SHA-256, checked on receipt: ${stated}.`;
  return `Inspection package saved: the index of filings and the completeness record, not the documents themselves.${says}${hash}`;
}

/** Fetch the study's inspection package and save it. The outcome in words; a failure with its reason. */
async function downloadInspectionPackage(studyId: string): Promise<Note> {
  let res: Response;
  try {
    res = await apiRequest('GET', `${tmfBase(studyId)}/inspection-package?scope=essential`);
  } catch (e) {
    return { tone: 'error', text: `${PACKAGE_FAILED} ${requestFailure(e).words}` };
  }
  if (!res.ok) return { tone: 'error', text: `${PACKAGE_FAILED} ${res.status === 401 ? SESSION_EXPIRED : `The server answered HTTP ${res.status}.`}` };
  const header = (name: string) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null);
  const stated = (header('X-TMF-SHA256') ?? '').toLowerCase();
  const sha = /^[0-9a-f]{64}$/.test(stated) ? stated : '';
  const bytes = await res.arrayBuffer();
  const received = await sha256Hex(bytes);
  if (sha && received !== null && received !== sha) {
    return { tone: 'error', text: `${PACKAGE_FAILED} The file received does not match the SHA-256 the server stated for it, so it was not saved.` };
  }
  const named = /filename="?([^";]+)"?/.exec(header('Content-Disposition') ?? '');
  const name = named ? named[1] : `${safeFileName(studyId, 'study')}_inspection-package.zip`;
  if (!downloadBlob(name, new Blob([bytes], { type: 'application/zip' }))) {
    return { tone: 'error', text: 'The inspection package was received, but the browser refused to save it.' };
  }
  return { tone: 'ok', text: packageSaved(header('X-TMF-Ready'), sha, sha ? received : null) };
}

/* ── The verdict ── */

/**
 * The one verdict the section states. Complete needs positive evidence
 * (assessmentState.ts): the server called it ready, it listed required records
 * to check, and none is open. The server's `ready: null` is not determined,
 * never complete and never incomplete.
 */
export function tmfVerdict(result: TmfCompletenessResult): TmfVerdict {
  const { zoneCount, totalRequired, totalMissing } = result.summary;
  if (zoneCount <= 0 || totalRequired <= 0) return 'not-assessed';
  const listed = Math.max(totalMissing, result.zones.reduce((n, z) => n + z.missing.length, 0));
  // Anything the server did not call ready carries at least one open record, listed or not.
  const open = result.ready === true ? listed : Math.max(1, listed);
  const state = assessmentStateFor({ loading: false }, { scopeExists: true, findingCount: open, assessmentRan: true });
  if (mayReassure(state)) return 'complete';
  return result.ready === null ? 'undetermined' : 'incomplete';
}

export function tmfVerdictSentence(verdict: TmfVerdict, result: TmfCompletenessResult): string {
  const { totalRequired, totalMissing } = result.summary;
  const filed = totalRequired - totalMissing;
  if (verdict === 'complete') return `Every essential record is filed: all ${totalRequired}, each against a Vault document that exists now.`;
  if (verdict === 'not-assessed') return 'No verdict. The read listed no essential records to check, so nothing is said about this trial master file.';
  if (verdict === 'undetermined') {
    return `Not determined. ${filed} of ${totalRequired} essential records are filed against a Vault document. The other ${totalMissing} ${are(totalMissing)} ` +
      'filed against a reference outside the Vault, which cannot be checked here, so this is neither complete nor incomplete.';
  }
  if (totalMissing <= 0) return 'Not complete, by this read: it did not state every essential record as filed, and it gave no count of what is missing.';
  const unverified = result.summary.totalUnverified ?? 0;
  const without = unverified > 0 ? ` ${unverified} of them ${are(unverified)} filed, but not against a Vault document that exists now.` : '';
  return `${filed} of ${totalRequired} essential records are filed. ${totalMissing} ${are(totalMissing)} missing.${without}`;
}

/* ── The records of a zone ── */

function recordsOf(zone: ZoneCompleteness, filings: ReadonlyMap<string, Filing> | null): TmfRecord[] {
  const present = new Set(zone.present);
  const unverified = new Map(zone.unverified.map((u) => [u.code, u.evidence]));
  return zone.required.map((code) => ({
    code,
    name: tmfArtifactName(code),
    // Counted as filed only where the server lists it as present; anything else is open.
    state: present.has(code) ? 'filed' : unverified.get(code) ?? 'missing',
    filing: filings?.get(code) ?? null,
  }));
}

/** The document a filing is filed against, as the server names it; the reference's id only where nothing names it. */
function documentName(filing: Filing, documents: readonly TmfVaultDocument[]): string {
  const doc = filing.document;
  if (doc) {
    const named = doc.title ? `“${doc.title}”` : 'a Vault document with no title';
    return `${named}${doc.version ? `, version ${doc.version}` : ''}${doc.current ? '' : ', an earlier version'}`;
  }
  const id = VAULT_REF.exec((filing.documentRef ?? '').trim())?.[1]?.trim();
  if (!id) return 'a Vault document';
  const title = documents.find((d) => d.docId === id)?.title;
  return title ? `“${title}”` : `Vault document ${id.slice(0, 8)}…`;
}

function recordSentence(r: TmfRecord, documents: readonly TmfVaultDocument[]): string {
  if (r.state === 'missing') return 'Not filed.';
  if (r.state === 'no_document') return 'Filed with no document, so it does not count as filed.';
  if (r.state === 'unresolved') return 'Filed against a Vault document that no longer exists, so it does not count as filed.';
  if (r.state === 'unverifiable') {
    return `Filed against a reference outside the Vault${r.filing?.documentRef ? ` (${r.filing.documentRef})` : ''}, which cannot be checked here.`;
  }
  if (!r.filing) return 'Filed against a Vault document.';
  const on = typeof r.filing.filedAt === 'string' && r.filing.filedAt ? ` on ${r.filing.filedAt.slice(0, 10)}` : '';
  return `Filed against ${documentName(r.filing, documents)}${on}.`;
}

/* ── The governed acts: file a document, remove a filing ── */

type Act = { code: string; kind: 'file' | 'remove' };
interface ActProps { record: TmfRecord; onDone: (note: Note) => void; onCancel: () => void }

/** One governed write: a refusal stays in the form; an outcome (done, or not known) closes it and is said above the list. */
function useGovernedAct(onDone: (note: Note) => void, unknown: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (write: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await write();
      onDone({ tone: 'ok', text: done });
    } catch (e) {
      if (e instanceof TmfWriteError && !e.unknown) setError(e.message);
      else onDone({ tone: 'error', text: unknown });
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ReasonField({ id, label, value, onChange, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <>
      <label className="vd-dr-meta" htmlFor={id}>{label}</label>
      <textarea id={id} className="vd-d-filing-reason" rows={2} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters`} />
    </>
  );
}

function FileForm({ projectId, studyId, record, onDone, onCancel }: ActProps & { projectId: string; studyId: string }) {
  const [picked, setPicked] = useState<PickedVaultVersion | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useGovernedAct(onDone, FILE_WORDS.unknown);
  const reasonId = useId();
  const short = reason.trim().length < GOVERNED_REASON_MIN;
  const file = () => {
    if (!picked) return;
    const version = picked.version ? `, version ${picked.version}` : '';
    // The reference is the id of the version chosen from the Vault, never one made up here.
    const body = { artifactCode: record.code, documentRef: `vault://${picked.id}`, reason: reason.trim() };
    void run(() => governedWrite('POST', `${tmfBase(studyId)}/artifacts`, body, FILE_WORDS),
      `${record.name} is filed against “${picked.title}”${version}. Your reason is recorded with the filing.`);
  };
  return (
    <div className="vd-confirm-form" data-testid={`vault-tmf-file-${record.code}`}>
      {picked ? (
        <p className="vd-dr-meta">
          Document: <b>{picked.title}</b>, version {picked.version ?? 'not recorded'}.{' '}
          <button type="button" className="btn ghost small" disabled={busy} onClick={() => setPicked(null)}>Choose another</button>
        </p>
      ) : (
        <VaultVersionPicker programId={projectId} disabled={busy} label={`Search this project’s Vault for the document to file as ${record.name}`} onChoose={setPicked} autoFocus />
      )}
      <ReasonField id={reasonId} label="Reason for filing it. Recorded with the filing in the audit trail." value={reason} onChange={setReason} disabled={busy} />
      <div className="vd-confirm-acts">
        <button type="button" className="btn ghost small" disabled={busy || !picked || short} onClick={file}>
          {busy ? 'Filing…' : `File as ${record.name}`}
        </button>
        <button type="button" className="vd-dr-toggle" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error ? <div className="vd-dr-err" role="alert">{error}</div> : null}
    </div>
  );
}

function RemoveForm({ record, onDone, onCancel }: ActProps) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useGovernedAct(onDone, REMOVE_WORDS.unknown);
  const reasonId = useId();
  const filingId = record.filing?.id;
  if (!filingId) return null;
  const remove = () => void run(
    () => governedWrite('DELETE', `/api/etmf/artifacts/${encodeURIComponent(filingId)}`, { reason: reason.trim() }, REMOVE_WORDS),
    `The filing of ${record.name} was removed from this study’s trial master file. Your reason is recorded with the removal. The document stays in the Vault.`,
  );
  return (
    <div className="vd-confirm-form" data-testid={`vault-tmf-remove-${record.code}`}>
      <ReasonField id={reasonId} label={`Reason for removing the filing of ${record.name}. The document stays in the Vault; the reason is recorded in the audit trail.`}
        value={reason} onChange={setReason} disabled={busy} />
      <div className="vd-confirm-acts">
        <button type="button" className="btn ghost small" disabled={busy || reason.trim().length < GOVERNED_REASON_MIN} onClick={remove}>
          {busy ? 'Removing…' : 'Remove the filing'}
        </button>
        <button type="button" className="vd-dr-toggle" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error ? <div className="vd-dr-err" role="alert">{error}</div> : null}
    </div>
  );
}

interface ZoneProps {
  zone: ZoneCompleteness; filings: ReadonlyMap<string, Filing> | null; documents: readonly TmfVaultDocument[];
  /** Offer the acts: a role that may write the Vault. They wait while a read is in flight. */
  canWrite: boolean; busy: boolean; act: Act | null; onAct: (act: Act | null) => void;
  form: (record: TmfRecord, kind: Act['kind']) => React.ReactNode;
}

/** A record's act: its visible word, and a name that says which record it acts on. */
function RowAct({ label, name, busy, onAct }: { label: string; name: string; busy: boolean; onAct: () => void }) {
  return <button type="button" className="btn ghost small" disabled={busy} aria-label={name} onClick={onAct}>{label}</button>;
}

/** A zone's line, then each of its essential records: what it is filed against, or that it is missing. */
function ZoneRows({ zone, filings, documents, canWrite, busy, act, onAct, form }: ZoneProps) {
  return (
    <>
      <div className="vd-dr-row vd-cov-mod" data-testid={`vault-tmf-zone-${zone.number}`}>
        <span className="vd-dr-kind">Zone {zone.number}</span>
        <span className="vd-dr-name">{zone.name}</span>
        <span className="vd-dr-detail">{zone.present.length} of {zone.required.length} filed</span>
      </div>
      {recordsOf(zone, filings).map((r) => (
        <React.Fragment key={r.code}>
          <div className="vd-dr-row" data-testid={`vault-tmf-record-${r.code}`} data-state={r.state}>
            <span className="vd-dr-name" title={r.name}>{r.name}</span>
            <span className="vd-dr-detail">{recordSentence(r, documents)}</span>
            {canWrite && r.state !== 'filed'
              ? <RowAct label="File a document" name={`File a document as ${r.name}`} busy={busy} onAct={() => onAct({ code: r.code, kind: 'file' })} /> : null}
            {canWrite && r.filing
              ? <RowAct label="Remove" name={`Remove the filing of ${r.name}`} busy={busy} onAct={() => onAct({ code: r.code, kind: 'remove' })} /> : null}
          </div>
          {/* Open only from a button above, so only for a role that may write; a re-read does not close it. */}
          {act?.code === r.code ? form(r, act.kind) : null}
        </React.Fragment>
      ))}
    </>
  );
}

/* ── The section ── */

/** The section's head: its heading, which study it is of, and the study chooser. One place for every state, so the chooser keeps its focus. */
function SectionHead({ headingId, sub, chooser }: { headingId: string; sub?: string; chooser?: React.ReactNode }) {
  const { heading } = useContext(HostContext);
  return (
    <div className="pj-sec-h">
      <h2 id={headingId}>{heading}</h2>
      {sub ? <span className="sec-sub">{sub}</span> : null}
      {chooser ? <div className="pj-sec-acts">{chooser}</div> : null}
    </div>
  );
}

function ReadFailureNote({ failure, onRetry, testId }: { failure: { message: string; retryable: boolean }; onRetry: () => void; testId: string }) {
  return (
    <p className="vd-dr-err" role="alert" data-testid={testId}>
      {failure.message}{' '}
      {failure.retryable ? <button type="button" className="btn ghost small" onClick={onRetry}>Try again</button> : null}
    </p>
  );
}

/** What the last act came to: a filing, a removal or the package. Kept when a read after it fails. */
function SaidNote({ note }: { note: Note | null }) {
  if (!note) return null;
  return <div className={note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'} role={note.tone === 'error' ? 'alert' : 'status'} data-testid="vault-tmf-note">{note.text}</div>;
}
const Line = ({ id, children }: { id?: string; children: React.ReactNode }) => <p className="vd-seals-empty" role="status" data-testid={id}>{children}</p>;

interface StudyTmfProps { projectId: string; study: Study; documents: readonly TmfVaultDocument[] }

/** What "filed" rests on, as the completeness service reports it, and what this does not assess. */
const whatCountsAsFiled = (basis: TmfCompletenessResult['basis']) =>
  'The essential records are those of the DIA TMF Reference Model that ICH E6(R3) Appendix C names. ' +
  (basis === 'verified_documents'
    ? 'A record counts as filed only when its filing names a Vault document that existed when this was read. A filing with no document, with a document that no longer exists, or with a reference outside the Vault does not count. '
    : 'These were counted from the record codes as listed; no document was checked. ') +
  'When a record was filed and whether it passed a quality check are not assessed. A document that is not yet in this project’s Vault is added there first, then filed here. ' +
  'The inspection package is the index of filings and this completeness record; it does not contain the documents.';

/** The package download: its button's state, and its outcome said where the section's other outcomes are. */
function usePackageDownload(studyId: string, say: (note: Note | null) => void) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    say(null);
    try {
      say(await downloadInspectionPackage(studyId));
    } catch (e) {
      say({ tone: 'error', text: `${PACKAGE_FAILED} ${e instanceof Error && e.message ? e.message : 'The file could not be read.'}` });
    } finally {
      setDownloading(false);
    }
  };
  return { downloading, download };
}

/** A study's assessed trial master file: the verdict in a sentence, the package, then the zones. */
function AssessedTmf({ projectId, study, documents, result, rereading, filed, reread, note, say }: StudyTmfProps & {
  result: TmfCompletenessResult; rereading: boolean; filed: DataState<Filing[]>; reread: () => void; note: Note | null; say: (note: Note | null) => void;
}) {
  const canWrite = useVaultCanWrite();
  const [act, setAct] = useState<Act | null>(null);
  const { downloading, download } = usePackageDownload(study.studyId, say);
  const verdict = tmfVerdict(result);
  const filings = filed.data ? new Map(filed.data.map((f) => [f.artifactCode, f])) : null;
  const filingsFailure = !filings && !filed.loading ? readFailure(filed, FILINGS_READ) : null;
  const done = (said: Note) => { say(said); setAct(null); reread(); };
  const form = (record: TmfRecord, kind: Act['kind']) => (kind === 'file'
    ? <FileForm projectId={projectId} studyId={study.studyId} record={record} onDone={done} onCancel={() => setAct(null)} />
    : <RemoveForm record={record} onDone={done} onCancel={() => setAct(null)} />);
  return (
    <>
      {rereading ? <Line>Reading the trial master file again…</Line>
        : <p className="vd-seals-note" role="status" data-testid="vault-tmf-verdict" data-verdict={verdict}>{tmfVerdictSentence(verdict, result)}</p>}
      <div className="vd-confirm-acts">
        <button type="button" className="btn ghost small" disabled={downloading} onClick={() => void download()} data-testid="vault-tmf-download">
          {downloading ? 'Building the package…' : 'Download the inspection package'}
        </button>
      </div>
      <SaidNote note={note} />
      {filingsFailure ? (
        <ReadFailureNote failure={{ ...filingsFailure, message: `${filingsFailure.message} ${FILINGS_UNREAD}` }} onRetry={reread} testId="vault-tmf-filings-error" />
      ) : null}
      {canWrite ? null : <VaultViewOnly act="file a document in the trial master file or remove a filing" testId="vault-tmf-view-only" />}
      <div className="vd-dr-rows vd-cov-rows vd-tmf-rows">
        {result.zones.filter((z) => z.required.length > 0).map((z) => (
          <ZoneRows key={z.number} zone={z} filings={filings} documents={documents} canWrite={canWrite} busy={rereading || filed.loading}
            act={act} onAct={setAct} form={form} />
        ))}
      </div>
      <details className="pj-more"><summary>What counts as filed</summary><p>{whatCountsAsFiled(result.basis)}</p></details>
    </>
  );
}

/** One study's trial master file: its two reads, then what they say. */
function StudyTmf(props: StudyTmfProps) {
  const { study } = props;
  /* Bumped after a write, so the verdict and the list are what the server holds, never a local patch. */
  const [epoch, setEpoch] = useState(0);
  const [note, setNote] = useState<Note | null>(null);
  const base = tmfBase(study.studyId);
  const completeness = useLiveData<TmfCompletenessResult>(`${base}/completeness?scope=essential`, [base, epoch],
    (v): v is TmfCompletenessResult => isCompleteness(v) && isAboutStudy(v, study.studyId));
  const filed = useLiveData<Filing[]>(`${base}/artifacts`, [base, epoch], isFilingList);
  const reread = () => setEpoch((n) => n + 1);
  useTellHost({ study, completeness });
  if (completeness.data) {
    return <AssessedTmf {...props} result={completeness.data} rereading={completeness.loading} filed={filed} reread={reread} note={note} say={setNote} />;
  }
  return (
    <>
      <SaidNote note={note} />
      {completeness.loading ? <Line>Reading the trial master file…</Line>
        : completeness.error ? <ReadFailureNote failure={readFailure(completeness, TMF_READ)} onRetry={reread} testId="vault-tmf-error" />
          : <Line id="vault-tmf-unassessed">The server returned no assessment for this study, so nothing is said about its trial master file.</Line>}
    </>
  );
}

const NO_STUDY = 'This project has no study yet, so it has no trial master file. A study is created in Protocol design, on the Study design tab of the project’s protocol.';

/** The project's studies: one is used, several are chosen between, none is said plainly. */
function ProjectTmf({ projectId, headingId, documents }: { projectId: string; headingId: string; documents: readonly TmfVaultDocument[] }) {
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState('');
  const path = `/api/study-design?program_id=${encodeURIComponent(projectId)}`;
  const studies = useLiveData<{ designs: Study[] }>(path, [path, attempt], isStudyList);
  const list = studies.data?.designs;
  const count = list?.length ?? 0;
  const study = (list?.length === 1 ? list[0] : list?.find((s) => s.studyId === chosen)) ?? null;
  // The host hears of the studies only while no study is on screen; a study's own read tells the rest.
  useTellHost(study ? null : { study: null, studies });
  const chooser = list && count > 1 ? (
    <select className="c2c-input vd-cov-pick" aria-label="Study" value={study?.studyId ?? ''} onChange={(e) => setChosen(e.target.value)} data-testid="vault-tmf-study">
      <option value="">Choose a study…</option>
      {list.map((s) => <option key={s.studyId} value={s.studyId}>{studyLabel(s)}</option>)}
    </select>
  ) : null;
  const body = () => {
    if (!list) {
      return studies.loading ? <Line>Reading this project’s studies…</Line>
        : <ReadFailureNote failure={readFailure(studies, STUDIES_READ)} onRetry={() => setAttempt((n) => n + 1)} testId="vault-tmf-error" />;
    }
    if (list.length === 0) return <Line id="vault-tmf-no-study">{NO_STUDY}</Line>;
    if (!study) return <Line id="vault-tmf-choose">A trial master file is of one study. Choose the study to see its trial master file.</Line>;
    return <StudyTmf key={study.studyId} projectId={projectId} study={study} documents={documents} />;
  };
  return (
    <>
      <SectionHead headingId={headingId} sub={study ? `Of ${studyLabel(study)}` : count > 1 ? `${count} studies in this project` : undefined} chooser={chooser} />
      {body()}
    </>
  );
}

export function VaultTrialMasterFile({ projectId, active, documents = NO_DOCUMENTS, heading = 'Trial master file', onState }: {
  projectId: string | null;
  /** The view that holds the section is on screen. Nothing is read before it first is. */
  active: boolean;
  documents?: readonly TmfVaultDocument[];
  /** The section's heading, for a host whose page is already titled "Trial master file". */
  heading?: string;
  /** Told what the section is showing, as it changes: for a host that tells AnA. */
  onState?: (state: TmfSectionState) => void;
}) {
  const [opened, setOpened] = useState(active);
  useEffect(() => { if (active) setOpened(true); }, [active]);
  const headingId = useId();
  const host = useMemo(() => ({ heading, onState }), [heading, onState]);
  if (!projectId) return null;
  return (
    <HostContext.Provider value={host}>
      <section className="pj-sec" id={VAULT_TMF_SECTION_ID} tabIndex={-1} aria-labelledby={headingId} data-testid="vault-tmf">
        {opened ? <ProjectTmf projectId={projectId} headingId={headingId} documents={documents} /> : <SectionHead headingId={headingId} />}
      </section>
    </HostContext.Provider>
  );
}
