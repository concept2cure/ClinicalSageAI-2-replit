/**
 * The trial master file section's reads, requests and words: what
 * VaultTrialMasterFile.tsx and its two parts (VaultTmfFiling.tsx,
 * VaultTmfPackage.tsx) say and send, with no markup. Split out of
 * VaultTrialMasterFile.tsx (2026-11-10), in its folder.
 *
 * GET    /api/study-design?program_id=<project>                         the project's studies
 * GET    /api/etmf/trials/:studyId/completeness?scope=essential|all     the verdict and the zones
 * GET    /api/etmf/trials/:studyId/artifacts                            each filing and its document
 * POST   /api/etmf/trials/:studyId/artifacts  { artifactCode, documentRef, reason }
 * DELETE /api/etmf/artifacts/:id              { reason }
 * GET    /api/etmf/trials/:studyId/inspection-package?scope=essential|all
 *
 * One verdict, computed once (`tmfVerdict`), is what the verdict line, the
 * figures, the package shown as a document and what AnA is told all state. A
 * verdict the server could not determine is "not determined". A read that
 * failed or was refused is said as that, through the one read classifier, and
 * is never an empty trial master file.
 */
import { tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import { VAULT_INGEST_DOCUMENT_TYPES, type VaultIngestDocumentType } from '@shared/constants/domain/vault-taxonomy';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
// The completeness response, typed by the service that computes it.
import type { TmfCompletenessResult, TmfUnverifiedEvidence, ZoneCompleteness } from '../../../../../server/services/etmf/tmf-completeness';
import { describeReadFailure, readFailureFor } from '../../mdx/hooks/useFetchJson';
import type { StudyDesignRow } from '../../mdx/hooks/useStudyDesign';
import { assessmentStateFor, mayReassure } from '../assessmentState';
import type { DataState, ShapeGuard } from '../dataConnect';
import { downloadBlob, safeFileName } from '../download';
import { sha256Hex } from './vaultArchiveDownload';

export type TmfStudy = Pick<StudyDesignRow, 'studyId' | 'title' | 'phase'>;
/** What is checked: the essential records (ICH E6(R3) Appendix C), or every record of the reference model. */
export type TmfScope = 'essential' | 'all';
/** A filing as GET /api/etmf/trials/:studyId/artifacts lists it, with the document the server found for its reference. */
export interface TmfFiling {
  id: string; artifactCode: string; documentRef: string | null; filedAt?: string | null;
  document?: { id: string; title: string | null; version: string | null; current: boolean } | null;
}
/** A document of the project's Vault as its host lists it: a second way to name what a record is filed against. */
export interface TmfVaultDocument { docId: string; title: string }
/** What an act came to, in words. `retry`: it failed in a way another try can change (never a refusal). */
export type TmfNote = { tone: 'ok' | 'error'; text: string; retry?: true };
export type TmfRecordState = 'filed' | 'missing' | TmfUnverifiedEvidence;
export interface TmfRecord { code: string; name: string; zone: number; state: TmfRecordState; filing: TmfFiling | null }
export type TmfVerdict = 'complete' | 'incomplete' | 'undetermined' | 'not-assessed';

export const SESSION_EXPIRED = 'Your session has expired. Sign in again.';
export const PACKAGE_FAILED = 'The inspection package was not downloaded.';
const VAULT_REF = /^vault:\/\/(.+)$/;
export const tmfBase = (studyId: string) => `/api/etmf/trials/${encodeURIComponent(studyId)}`;
export const studyLabel = (s: TmfStudy) => [s.title?.trim(), s.phase ? `Phase ${s.phase}` : ''].filter(Boolean).join(' · ') || s.studyId;
export const studyName = (s: TmfStudy) => s.title?.trim() || s.studyId;
const are = (n: number) => (n === 1 ? 'is' : 'are');

export const SCOPE_LABEL: Record<TmfScope, string> = { essential: 'Essential records', all: 'All records' };
/** Which records a scope checks, said once under the figures. */
export const SCOPE_SENTENCE: Record<TmfScope, string> = {
  essential: 'Essential records are those of the DIA TMF Reference Model that ICH E6(R3) Appendix C names.',
  all: 'All records are every record of the DIA TMF Reference Model filed here, essential or not.',
};
/** What the scope checks, as a sentence names it: "essential records", "record". */
export const scopeNoun = (scope: TmfScope, n = 2) => `${scope === 'all' ? '' : 'essential '}record${n === 1 ? '' : 's'}`;

/* ── What the reads must carry. A 200 that is not the shape is a failed read, never an empty one. ── */

export const isStudyList: ShapeGuard<{ designs: TmfStudy[] }> = (v): v is { designs: TmfStudy[] } => {
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
function isCompleteness(v: unknown): v is TmfCompletenessResult {
  const r = v as Partial<TmfCompletenessResult> | null;
  const s = r?.summary as Record<string, unknown> | undefined;
  return !!r && (r.ready === null || typeof r.ready === 'boolean') && Array.isArray(r.zones) && r.zones.every(isZone) &&
    !!s && ['zoneCount', 'zonesComplete', 'totalRequired', 'totalMissing'].every((k) => Number.isSafeInteger(s[k]));
}
/**
 * The completeness answer for this study and this scope. The answer names the
 * study it is about (`study`, since 2026-11-10) and the scope it checked: one
 * about another study, or another scope, is not the answer asked for, and its
 * figures are never shown under this study's name or this scope's label.
 */
export function isCompletenessOf(studyId: string, scope: TmfScope): ShapeGuard<TmfCompletenessResult> {
  return (v): v is TmfCompletenessResult => {
    if (!isCompleteness(v)) return false;
    const named = (v as { study?: { studyId?: unknown } }).study?.studyId;
    return (named === undefined || named === studyId) && v.scope === scope;
  };
}
export const isFilingList: ShapeGuard<TmfFiling[]> = (v): v is TmfFiling[] =>
  Array.isArray(v) && v.every((f) => typeof f?.id === 'string' && f.id !== '' && typeof f.artifactCode === 'string' &&
    (f.documentRef == null || typeof f.documentRef === 'string'));

/* ── A read or a request that returned nothing, said as what it was ── */

export interface ReadFailureWords { message: string; retryable: boolean }
/** A read's failure in words: a refusal through the one read classifier, or a failure that is not an empty answer. */
export function readFailure(
  read: Pick<DataState<unknown>, 'status' | 'code'>,
  words: { what: string; failed: string; subject: string },
): ReadFailureWords {
  if (read.status === 401) return { message: `Your session has expired. Sign in again to read ${words.what}.`, retryable: false };
  const kind = readFailureFor(read.status, read.code);
  if (kind === 'failed') return { message: words.failed, retryable: true };
  const said = describeReadFailure(kind, words.what, { subject: words.subject });
  return { message: said.message, retryable: said.retryable };
}
export const STUDIES_READ = { what: 'this project’s studies', subject: 'this project',
  failed: 'This project’s studies could not be read. This does not mean the project has no study.' };
export const TMF_READ = { what: 'the trial master file', subject: 'this study',
  failed: 'The trial master file could not be read. This is not an empty trial master file.' };
export const FILINGS_READ = { what: 'the list of filings', subject: 'this study', failed: 'The list of filings could not be read.' };
export const FILINGS_UNREAD = 'The document each record is filed against is not shown, and a filing cannot be removed here.';

/**
 * A request the server did not carry out. `refused`: it answered and said no,
 * so nothing changed. Otherwise no verdict arrived (a dropped connection, a
 * server error) and a write may have been recorded.
 */
export function requestFailure(e: unknown): { refused: boolean; words: string } {
  const { status, code, payload } = (e ?? {}) as { status?: unknown; code?: unknown; payload?: unknown };
  if (typeof status !== 'number' || status <= 0) return { refused: false, words: 'The server did not answer.' };
  const kind = readFailureFor(status, typeof code === 'string' ? code : undefined);
  const refused = status < 500;
  if (kind === 'failed') return { refused, words: redactInternals(serverMessage(payload), `The server answered HTTP ${status}.`) };
  if (kind !== 'not-found') return { refused, words: `${describeReadFailure(kind, 'it').title}.` };
  if (code === 'STUDY_NOT_FOUND') return { refused, words: 'This study was not found in your organization.' };
  return { refused, words: redactInternals(serverMessage(payload), 'It was not found in your organization.') };
}

/** A governed write that did not succeed. `unknown`: it may have been recorded. `why`: the refusal alone. */
export class TmfWriteError extends Error {
  constructor(message: string, readonly unknown: boolean, readonly why = '') { super(message); this.name = 'TmfWriteError'; }
}

export async function governedWrite(method: 'POST' | 'DELETE', path: string, body: unknown, words: { refused: string; unknown: string }): Promise<void> {
  let res: Response;
  try {
    res = await apiRequest(method, path, body);
  } catch (e) {
    const failure = requestFailure(e);
    throw failure.refused ? new TmfWriteError(`${words.refused} ${failure.words}`, false, failure.words) : new TmfWriteError(words.unknown, true);
  }
  // apiRequest resolves a 401 instead of throwing it.
  if (res.ok) return;
  const why = res.status === 401 ? SESSION_EXPIRED : `The server answered HTTP ${res.status}.`;
  throw new TmfWriteError(`${words.refused} ${why}`, false, why);
}
/** What a write says when it was refused (nothing changed), and when no answer came (it may have been recorded). */
const writeWords = (done: string, act: string, doing: string) => ({
  refused: `Nothing was ${done}.`,
  unknown: `The server did not confirm the ${act}, so it is not known whether it was recorded. The trial master file was read again: check the record below before ${doing} it again.`,
});
export const FILE_WORDS = writeWords('filed', 'filing', 'filing');
export const REMOVE_WORDS = writeWords('removed', 'removal', 'removing');

/**
 * The Vault's ingest type for a file uploaded against a record. The record the
 * person chose is what they said the file is, so this is not a guess from a
 * file name (which useVaultUpload.ts refuses to make). Only a code that IS an
 * accepted type maps to it; every other record is OTHER, never a regulatory
 * type nobody stated.
 */
export function tmfIngestType(code: string): VaultIngestDocumentType {
  const upper = code.trim().toUpperCase();
  const exact = VAULT_INGEST_DOCUMENT_TYPES.find((t) => t === upper);
  if (exact) return exact;
  return upper === 'INVESTIGATORS_BROCHURE' ? 'IB' : 'OTHER';
}

/* ── The inspection package ── */

function packageSaved(scope: TmfScope, ready: string | null, stated: string, received: string | null): string {
  const says = ready === 'true' ? ` It says every ${scopeNoun(scope, 1)} is filed.`
    : ready === 'undetermined' ? ' It says the verdict is not determined.'
      : ready === 'false' ? ` It says ${scopeNoun(scope)} are still missing.` : '';
  const hash = !stated ? ' The server did not state its SHA-256.'
    : received === null ? ` SHA-256 stated by the server: ${stated}. This browser could not check it.`
      : ` Its SHA-256, checked on receipt: ${stated}.`;
  return `Inspection package saved (${SCOPE_LABEL[scope].toLowerCase()}): the index of filings and the completeness record, not the documents themselves.${says}${hash}`;
}

/**
 * Fetch the study's inspection package for the scope on screen and save it.
 * The outcome in words; a failure with its reason. Nothing is built in the
 * browser in its place: the server records this download before it sends it,
 * and refuses to send one it could not record (503 UNAUDITED_EXPORT_REFUSED).
 */
export async function downloadInspectionPackage(studyId: string, scope: TmfScope): Promise<TmfNote> {
  let res: Response;
  try {
    res = await apiRequest('GET', `${tmfBase(studyId)}/inspection-package?scope=${scope}`);
  } catch (e) {
    const failure = requestFailure(e);
    return { tone: 'error', text: `${PACKAGE_FAILED} ${failure.words}`, ...(failure.refused ? {} : { retry: true as const }) };
  }
  if (res.status === 401) return { tone: 'error', text: `${PACKAGE_FAILED} ${SESSION_EXPIRED}` };
  if (!res.ok) return { tone: 'error', text: `${PACKAGE_FAILED} The server answered HTTP ${res.status}.`, retry: true };
  const header = (name: string) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null);
  const stated = (header('X-TMF-SHA256') ?? '').toLowerCase();
  const sha = /^[0-9a-f]{64}$/.test(stated) ? stated : '';
  const bytes = await res.arrayBuffer();
  const received = await sha256Hex(bytes);
  if (sha && received !== null && received !== sha) {
    return { tone: 'error', text: `${PACKAGE_FAILED} The file received does not match the SHA-256 the server stated for it, so it was not saved.`, retry: true };
  }
  const named = /filename="?([^";]+)"?/.exec(header('Content-Disposition') ?? '');
  const name = named ? named[1] : `${safeFileName(studyId, 'study')}_inspection-package.zip`;
  if (!downloadBlob(name, new Blob([bytes], { type: 'application/zip' }))) {
    return { tone: 'error', text: 'The inspection package was received, but the browser refused to save it.', retry: true };
  }
  return { tone: 'ok', text: packageSaved(scope, header('X-TMF-Ready'), sha, sha ? received : null) };
}

/* ── The verdict and the figures ── */

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
  const records = scopeNoun(result.scope);
  if (verdict === 'complete') return `Every ${scopeNoun(result.scope, 1)} is filed: all ${totalRequired}, each against a Vault document that exists now.`;
  if (verdict === 'not-assessed') return `No verdict. The read listed no ${records} to check, so nothing is said about this trial master file.`;
  if (verdict === 'undetermined') {
    return `Not determined. ${filed} of ${totalRequired} ${records} are filed against a Vault document. The other ${totalMissing} ${are(totalMissing)} ` +
      'filed against a reference outside the Vault, which cannot be checked here, so this is neither complete nor incomplete.';
  }
  if (totalMissing <= 0) return `Not complete, by this read: it did not state every ${scopeNoun(result.scope, 1)} as filed, and it gave no count of what is missing.`;
  const unverified = result.summary.totalUnverified ?? 0;
  const without = unverified > 0 ? ` ${unverified} of them ${are(unverified)} filed, but not against a Vault document that exists now.` : '';
  return `${filed} of ${totalRequired} ${records} are filed. ${totalMissing} ${are(totalMissing)} missing.${without}`;
}

/** The verdict as the inspection package's cover states it. One word per verdict: the cover can say nothing the verdict line does not. */
export const READINESS_LABEL: Record<TmfVerdict, string> = {
  complete: 'Inspection-ready, on completeness',
  incomplete: 'Not inspection-ready',
  undetermined: 'Readiness not determined',
  'not-assessed': 'No verdict',
};
const READINESS_SENTENCE: Record<TmfVerdict, string> = {
  complete: 'On a completeness basis it is inspection-ready.',
  incomplete: 'It is not yet inspection-ready. The open records are listed in part 3.',
  undetermined: 'Its inspection readiness is not determined: neither ready nor not ready. Filing each of those records against a Vault document settles it. They are listed in part 3.',
  'not-assessed': 'No readiness is stated.',
};
/** Part 1 of the package: the verdict line's own sentence, then what it means for an inspection. */
export const readinessParagraph = (verdict: TmfVerdict, result: TmfCompletenessResult) =>
  `${tmfVerdictSentence(verdict, result)} ${READINESS_SENTENCE[verdict]}`;

/** The three figures the section and the package state: zones complete, records filed, records open. */
export interface TmfFigures { zonesComplete: number; zoneCount: number; filed: number; required: number; open: number; unverified: number | null }
/**
 * The figures of an answer, or null where it has none to state: it checked
 * nothing (a row of zeros would read as a count), or it is not ready and gave
 * no count of what is missing (filed = required would read as complete). The
 * verdict line says which; the section, the package and what AnA is told all
 * take this one answer, so none shows a figure the others do not.
 */
export function tmfFigures(result: TmfCompletenessResult): TmfFigures | null {
  const s = result.summary;
  if (s.zoneCount <= 0 || s.totalRequired <= 0) return null;
  if (result.ready !== true && s.totalMissing <= 0) return null;
  return {
    zonesComplete: s.zonesComplete, zoneCount: s.zoneCount, filed: s.totalRequired - s.totalMissing, required: s.totalRequired, open: s.totalMissing,
    // How many open records have a filing with no verified document. Not reported is said, never read as none.
    unverified: Number.isSafeInteger(s.totalUnverified) ? s.totalUnverified : null,
  };
}
/** "3 filed with no verified document", as the open figure qualifies itself. */
export const unverifiedWords = (n: number | null) =>
  (n === null ? 'how many are filed with no verified document was not reported' : `${n} filed with no verified document`);

/** The three figures in one sentence, from the same numbers the screen shows: what AnA is told is on screen. Empty where there are none. */
export function tmfFiguresSentence(result: TmfCompletenessResult): string {
  const f = tmfFigures(result);
  if (!f) return '';
  return `${f.zonesComplete} of ${f.zoneCount} zones are complete; ${f.filed} of ${f.required} ${scopeNoun(result.scope)} are filed; ` +
    `${f.open} ${f.open === 1 ? 'is' : 'are'} open${f.open > 0 ? `, ${unverifiedWords(f.unverified)}` : ''}.`;
}

/** What "filed" rests on, as the completeness service reports it. */
export const basisSentence = (basis: TmfCompletenessResult['basis']) => (basis === 'verified_documents'
  ? 'A record counts as filed only when its filing names a Vault document that existed when this was read. A filing with no document, with a document that no longer exists, or with a reference outside the Vault does not count.'
  : 'These were counted from the record codes as listed; no document was checked.');
/** The two lenses the completeness read does not carry, and why. */
export const NOT_ASSESSED = 'Timeliness and quality control are not assessed: no filing lag and no QC state is recorded for trial master file records.';

/** What AnA is asked from the section: the gaps an inspector would raise for this study, and how to close them. */
export const tmfAskPrompt = (study: TmfStudy) =>
  `Which trial master file gaps would an inspector raise for ${studyName(study)}, and how do I close them?`;

/* ── The records of a zone ── */

export function recordsOf(zone: ZoneCompleteness, filings: ReadonlyMap<string, TmfFiling> | null): TmfRecord[] {
  const present = new Set(zone.present);
  const unverified = new Map(zone.unverified.map((u) => [u.code, u.evidence]));
  return zone.required.map((code) => ({
    code,
    name: tmfArtifactName(code),
    zone: zone.number,
    // Counted as filed only where the server lists it as present; anything else is open.
    state: present.has(code) ? 'filed' : unverified.get(code) ?? 'missing',
    filing: filings?.get(code) ?? null,
  }));
}

/** The document a filing is filed against, as the server names it; the reference's id only where nothing names it. */
function documentName(filing: TmfFiling, documents: readonly TmfVaultDocument[]): string {
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

export function recordSentence(r: TmfRecord, documents: readonly TmfVaultDocument[]): string {
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
