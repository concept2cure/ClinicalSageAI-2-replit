import { useEffect, useReducer, useRef } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { capturedActorHeaders } from '@/utils/authToken';
import { shellProgramId } from '../shellProject';
import { taskActorScope, type TaskActorScope } from '../taskTarget';
import { unboundNotice } from '../governanceNotice';
import { hasAuthoringCreationOutcome, readAuthoringCreationRecovery, hasAuthoringSectionCreationOutcome, readAuthoringSectionCreationRecovery, useAuthoringAttemptLedger, type AuthoringAttemptLedger, type AuthoringCreationRecoveryIdentity, type AuthoringSectionCreationRecoveryIdentity } from './authoringCreationRecovery';

export type CreationKind = 'document' | 'section';
type Receipt = { id: string; title: string } | { id: string; code: string };
type Phase = 'pending' | 'unknown' | 'failed' | 'created';
export interface CreationState {
  phase: Phase;
  message: string;
  receipt?: Receipt;
  checking?: boolean;
  recovery?: AuthoringCreationRecoveryIdentity | AuthoringSectionCreationRecoveryIdentity;
  canOpenRecovered?: boolean;
  identifiedOutcome?: boolean;
}
interface Entry extends CreationState { attempt: object; owner?: object }
interface Options {
  programId: string | null;
  openProject: string | null;
  docId: string | null;
  programSwitchHeld: boolean;
  fireToast: (message: string, tone?: 'ok' | 'error') => void;
  onDocCreated: (document: { id: string; title: string }) => void;
  onSectionCreated: (section: { id: string; code: string }) => void;
  onCheckCreation?: (kind: CreationKind) => boolean | Promise<boolean>;
}
interface CreationOwner {
  generation: number;
  retired: boolean;
  actor: TaskActorScope | null;
  session: ReturnType<typeof authService.captureSessionReadGuard>;
}
type Ledger = AuthoringAttemptLedger<CreationKind, Entry> & {
  ownerCurrent: () => boolean;
  headers: () => Record<string, string>;
  organizationId: string | undefined;
};
const accountChanged = 'Your signed-in account or organization changed. Sign in and reopen creation before continuing.';

function sameActor(a: TaskActorScope | null, b: TaskActorScope | null): boolean {
  return a?.userId === b?.userId && a?.organizationId === b?.organizationId;
}

/** A real session replacement retires its lanes; a same-session refresh keeps them. */
function useCreationOwner() {
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const actor = taskActorScope(authService.getUser());
  const ownerRef = useRef<CreationOwner>({ generation: 0, retired: false, actor, session: authService.captureSessionReadGuard() });
  if (ownerRef.current.retired || !ownerRef.current.session.sameRevision() || !sameActor(ownerRef.current.actor, actor)) {
    ownerRef.current = { generation: ownerRef.current.generation + 1, retired: false, actor, session: authService.captureSessionReadGuard() };
  }
  useEffect(() => {
    const stops = (['login', 'logout', 'session_expired', 'user_updated', 'token_refresh'] as const).map(event => authService.on(event, redraw));
    return () => { stops.forEach(stop => stop()); };
  }, []);
  const owner = ownerRef.current;
  const headers = () => {
    try {
      if (ownerRef.current !== owner || owner.retired || !owner.session.sameRevision() || !owner.actor
        || !sameActor(owner.actor, taskActorScope(authService.getUser()))) throw new Error(accountChanged);
      return capturedActorHeaders({ userId: Number(owner.actor.userId), organizationId: Number(owner.actor.organizationId) });
    } catch {
      owner.retired = true;
      throw new Error(accountChanged);
    }
  };
  const current = () => { try { headers(); return true; } catch { return false; } };
  return { owner, current, headers };
}

const names = (kind: CreationKind) => kind === 'document' ? 'working documents' : 'document sections';
const unknownMessage = (kind: CreationKind) =>
  `Could not confirm whether the ${kind} was created. Check ${names(kind)} before creating another.`;

function creationRefusal({ programId, openProject, programSwitchHeld }: Options): string | null {
  if (!programId) return 'Open a project first — a document belongs to a project.';
  return programSwitchHeld || openProject !== programId
    ? 'Finish the project switch before creating a document or section.' : null;
}

/** Navigation must retain every unresolved attempt, including a prior project. */
function creationLeaveRefusal(entries: Iterable<Entry>): string | null {
  // Exact readback and a confirmed host release navigation; the unknown phase
  // still prevents a duplicate create of this attempted record.
  const unresolved = Array.from(entries).find(entry => entry.checking || entry.phase === 'pending'
    || (entry.phase === 'unknown' && entry.canOpenRecovered !== true));
  if (!unresolved) return null;
  if (unresolved.checking) return 'Creation is still being checked. Wait for the record and working list to refresh before leaving.';
  return unresolved.phase === 'pending'
    ? 'A document or section is still being created. Wait for its outcome before leaving; closing the form does not cancel the request.'
    : 'A document or section creation is still unconfirmed. Check working documents or document sections in its project before leaving.';
}

/** Retain uncertain attempts on return to a project; never release a newer request. */
function useCreationLedger(options: Options): Ledger {
  const { programId, openProject, docId, programSwitchHeld } = options;
  const { owner, current, headers } = useCreationOwner();
  const scope = `${owner.generation}:${programId}:${openProject}:${docId}:${programSwitchHeld}`;
  const ledger = useAuthoringAttemptLedger<CreationKind, Entry>(scope,
    kind => `${owner.generation}:${kind}:${programId}${kind === 'section' ? `:${docId}` : ''}`,
    () => current() && shellProgramId() === programId,
    entries => current() ? creationLeaveRefusal(Array.from(entries).filter(entry => entry.owner === owner)) : null);
  return { ...ledger, ownerCurrent: current, headers, organizationId: owner.actor?.organizationId,
    read: kind => current() ? ledger.read(kind) : undefined,
    record: (kind, entry) => ledger.record(kind, { ...entry, owner }),
    begin: (kind, entry, blocked) => ledger.begin(kind, { ...entry, owner }, blocked),
    replaceIfOwned: (kind, attempt, entry) => ledger.replaceIfOwned(kind, attempt, { ...entry, owner }),
  };
}

function creationReceipt(kind: CreationKind, body: unknown, request: Record<string, unknown>): Receipt | null {
  if ((body as { success?: unknown } | null)?.success !== true) return null;
  const row = (body as { document?: unknown; section?: unknown } | null)?.[kind];
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (kind === 'section') return value.doc_id === request.doc_id && typeof value.code === 'string'
    ? { id: value.id, code: value.code } : null;
  return documentReceipt(value.id, value, request);
}

function documentReceipt(id: string, value: Record<string, unknown>, request: Record<string, unknown>): Receipt | null {
  return value.client_program_id === request.client_program_id
    && (value.template_id ?? null) === (request.template_id ?? null) && typeof value.title === 'string'
    ? { id, title: value.title } : null;
}

function creationMessage(kind: CreationKind, receipt: Receipt, body: unknown, templateLabel?: string): string {
  if (kind === 'section' && 'code' in receipt) return `Section created · ${receipt.code} (initial revision recorded)`;
  const value = body as { sections_seeded?: unknown; governance?: unknown };
  const count = value.sections_seeded;
  return `Document created · ${'title' in receipt ? receipt.title : ''}`
    + (templateLabel && typeof count === 'number' ? ` (${count} section${count === 1 ? '' : 's'} from ${templateLabel})` : '')
    + unboundNotice(value.governance);
}

async function receiveCreation(kind: CreationKind, request: Record<string, unknown>, headers: Record<string, string>, templateLabel?: string) {
  const response = await apiRequest('POST', `/api/authoring/${kind === 'document' ? 'docs' : 'sections'}`, request, headers);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || hasAuthoringCreationOutcome(body) || hasAuthoringSectionCreationOutcome(body)) throw new ApiRequestError(serverMessage(body) ?? 'The server refused it.', response.status, body);
  const receipt = creationReceipt(kind, body, request);
  return receipt ? { receipt, message: creationMessage(kind, receipt, body, templateLabel) } : null;
}

function failedCreation(kind: CreationKind, error: unknown, attempt: object, options: Options, organizationId: string | undefined): Entry {
  const payload = error instanceof ApiRequestError ? error.payload : null;
  const identified = kind === 'document' ? hasAuthoringCreationOutcome(payload) : hasAuthoringSectionCreationOutcome(payload);
  if (identified) {
    const recovery = kind === 'document' ? readAuthoringCreationRecovery(payload, organizationId, options.programId)
      : readAuthoringSectionCreationRecovery(payload, organizationId, options.docId, options.programId);
    return { attempt, phase: 'unknown', identifiedOutcome: true, ...(recovery ? { recovery } : {}), message: recovery
      ? identifiedCreationMessage(recovery) : unknownMessage(kind) };
  }
  const refused = error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408;
  return { attempt, phase: refused ? 'failed' : 'unknown', message: refused
    ? `Couldn’t create the ${kind} — ${redactInternals(error.message, 'the server refused it')}. Nothing was created.`
    : unknownMessage(kind) };
}

function identifiedCreationMessage(recovery: AuthoringCreationRecoveryIdentity | AuthoringSectionCreationRecoveryIdentity): string {
  if ('sectionId' in recovery) return `Section ${recovery.sectionId} in document ${recovery.documentId}: creation outcome is unconfirmed. Check this exact section in its original project. Do not retry creation.`;
  return `Document ${recovery.documentId}: ${recovery.creationOutcome === 'committed' ? 'creation committed, but its current access could not be confirmed' : 'creation outcome is unconfirmed'}. Check this exact document in its original project. Do not retry creation.`;
}
function recoveryCurrent(entry: Entry, options: Options, ledger: Ledger): boolean {
  const recovery = entry.recovery;
  return !recovery || (Number(ledger.organizationId) === recovery.organizationId
    && recovery.programId === options.programId && (!('sectionId' in recovery) || recovery.documentId === options.docId));
}

async function executeCreation({ kind, request, finished, templateLabel }: {
  kind: CreationKind; request: Record<string, unknown>; finished: () => void; templateLabel?: string;
}, options: Options, ledger: Ledger) {
  const attempt = {};
  if (!ledger.begin(kind, { attempt, phase: 'pending', message: `Creating ${kind}…` },
    () => ['pending', 'unknown'].includes(ledger.read(kind)?.phase ?? '')
      || ledger.read(kind === 'document' ? 'section' : 'document')?.phase === 'pending')) return;
  let result: Entry;
  try {
    const confirmed = await receiveCreation(kind, request, ledger.headers(), templateLabel);
    result = confirmed ? { attempt, phase: 'created', ...confirmed }
      : { attempt, phase: 'unknown', message: unknownMessage(kind) };
  } catch (error) { result = failedCreation(kind, error, attempt, options, ledger.organizationId); }
  if (ledger.read(kind)?.attempt !== attempt) return;
  if (!ledger.current()) {
    ledger.record(kind, { attempt, phase: 'unknown', message: unknownMessage(kind) });
    return;
  }
  ledger.record(kind, result);
  if (result.phase !== 'created') {
    options.fireToast(result.message, 'error');
    if (result.phase === 'unknown') finished();
    return;
  }
  finished();
  options.fireToast(result.message);
  void openReceipt(kind, result.receipt!, options, ledger.current);
}

async function openReceipt(kind: CreationKind, receipt: Receipt, options: Options, current: () => boolean) {
  try {
    if (kind === 'document' && 'title' in receipt) await options.onDocCreated(receipt);
    else if (kind === 'section' && 'code' in receipt) await options.onSectionCreated(receipt);
  } catch {
    if (current()) options.fireToast(`The ${kind} was created, but could not be opened. Check ${names(kind)}.`, 'error');
  }
}

function scopedRows(kind: CreationKind, body: unknown, options: Options): boolean {
  const rows = (body as { documents?: unknown; sections?: unknown } | null)?.[kind === 'document' ? 'documents' : 'sections'];
  return (body as { success?: unknown } | null)?.success === true
    && Array.isArray(rows) && rows.every(row => row && typeof row === 'object'
    && typeof row.id === 'string' && row.id.trim() && (kind === 'document'
      ? row.program_id === options.programId : row.doc_id === options.docId));
}

function sameAttempt(ledger: Ledger, kind: CreationKind, entry: Entry): boolean {
  return ledger.current() && ledger.read(kind)?.attempt === entry.attempt;
}

function mayCheck(entry: Entry | undefined, options: Options, ledger: Ledger): entry is Entry {
  return !!entry && entry.phase === 'unknown' && !entry.checking && ledger.current() && recoveryCurrent(entry, options, ledger) && !creationRefusal(options);
}

async function confirmCreationHost(kind: CreationKind, entry: Entry, options: Options, ledger: Ledger): Promise<boolean> {
  const confirmed = await options.onCheckCreation?.(kind);
  if (!sameAttempt(ledger, kind, entry)) return false;
  if (confirmed !== true) throw new Error('The current host refresh was not confirmed.');
  return true;
}

async function checkCreation(kind: CreationKind, options: Options, ledger: Ledger) {
  const entry = ledger.read(kind);
  if (!mayCheck(entry, options, ledger)) return;
  ledger.record(kind, { ...entry, checking: true, canOpenRecovered: false });
  try {
    const path = kind === 'document' ? `/api/authoring/docs?status=all&programId=${encodeURIComponent(options.programId!)}`
      : `/api/authoring/docs/${encodeURIComponent(options.docId!)}/sections`;
    const response = await apiRequest('GET', path, undefined, ledger.headers());
    const body: unknown = await response.json();
    if (!response.ok || !scopedRows(kind, body, options)) throw new Error('The scoped list could not be verified.');
    if (!sameAttempt(ledger, kind, entry)) return;
    if (await checkRecoveryIdentity(kind, entry, body, options, ledger)) return;
    if (!await confirmCreationHost(kind, entry, options, ledger)) return;
    ledger.record(kind, { ...entry, checking: false, phase: 'failed', message:
      `${kind === 'document' ? 'Project working documents were read' : 'Document sections were read'}. Inspect them before starting another ${kind}. This read does not identify which request created a record.` });
  } catch {
    if (sameAttempt(ledger, kind, entry)) {
      ledger.record(kind, { ...entry, checking: false, canOpenRecovered: false, message:
        `Could not check ${names(kind)}. Creation is still unconfirmed; another ${kind} has not been requested.` });
    }
  } finally {
    const pending = ledger.read(kind);
    if (pending?.attempt === entry.attempt && pending.checking) ledger.record(kind, { ...pending, checking: false });
  }
}

async function checkRecoveryIdentity(kind: CreationKind, entry: Entry, body: unknown, options: Options, ledger: Ledger): Promise<boolean> {
  if (!entry.identifiedOutcome && !entry.recovery) return false;
  if (!entry.recovery) throw new Error('The recovery identity could not be verified.');
  if (kind === 'document') await checkIdentifiedDocument(entry, body, options, ledger);
  else await checkIdentifiedSection(entry, body, options, ledger);
  return true;
}

async function checkIdentifiedDocument(entry: Entry, inventory: unknown, options: Options, ledger: Ledger) {
  const id = entry.recovery!.documentId;
  const rows = (inventory as { documents: { id: string }[] }).documents;
  if (!rows.some(row => row.id === id)) throw new Error('The identified document is not visible in this project.');
  const response = await apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(id)}`, undefined, ledger.headers());
  const body = await response.json() as { success?: boolean; document?: { id?: string; title?: string; client_program_id?: string } };
  if (!sameAttempt(ledger, 'document', entry)) return;
  if (!response.ok || body.success !== true || body.document?.id !== id || typeof body.document.title !== 'string'
    || body.document.client_program_id !== options.programId) throw new Error('The identified document could not be verified.');
  if (!await confirmCreationHost('document', entry, options, ledger)) return;
  ledger.record('document', { ...entry, checking: false, canOpenRecovered: true,
    receipt: { id, title: body.document.title }, message:
      `Identified document ${id} is currently readable in this project. Open it to review the saved record; no additional creation was requested.` });
}

function recoveredSectionCode(payload: unknown, recovery: AuthoringSectionCreationRecoveryIdentity): string | null {
  const rows = (payload as { sections: Array<{ id: string; doc_id: string; code?: string }> }).sections;
  const matches = rows.filter(row => row.id === recovery.sectionId && row.doc_id === recovery.documentId);
  return matches.length === 1 && typeof matches[0].code === 'string' && matches[0].code.trim() ? matches[0].code : null;
}
function recoveredParentMatches(body: unknown, recovery: AuthoringSectionCreationRecoveryIdentity): boolean {
  const detail = body as { success?: boolean; document?: { id?: string; client_program_id?: string } } | null;
  return detail?.success === true && detail.document?.id === recovery.documentId
    && detail.document.client_program_id === recovery.programId;
}

function currentSectionRecovery(entry: Entry, options: Options, ledger: Ledger): AuthoringSectionCreationRecoveryIdentity | null {
  const recovery = entry.recovery;
  return recovery && 'sectionId' in recovery && recoveryCurrent(entry, options, ledger) ? recovery : null;
}

async function checkIdentifiedSection(entry: Entry, payload: unknown, options: Options, ledger: Ledger) {
  const recovery = currentSectionRecovery(entry, options, ledger);
  if (!recovery) throw new Error('The section recovery scope changed.');
  const code = recoveredSectionCode(payload, recovery);
  if (code === null) throw new Error('The identified section is not visible.');
  const response = await apiRequest('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(recovery.programId)}`, undefined, ledger.headers());
  const body: unknown = await response.json();
  if (!sameAttempt(ledger, 'section', entry) || !recoveryCurrent(entry, options, ledger)) return;
  if (!response.ok || !scopedRows('document', body, options)
    || !(body as { documents: Array<{ id: string }> }).documents.some(row => row.id === recovery.documentId)) throw new Error('The saved parent is not in this project.');
  const detailResponse = await apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(recovery.documentId)}`, undefined, ledger.headers());
  const detail: unknown = await detailResponse.json();
  if (!sameAttempt(ledger, 'section', entry) || !recoveryCurrent(entry, options, ledger)) return;
  if (!detailResponse.ok || !recoveredParentMatches(detail, recovery)) throw new Error('The exact parent project could not be confirmed.');
  if (!await confirmCreationHost('section', entry, options, ledger) || !recoveryCurrent(entry, options, ledger)) return;
  ledger.record('section', { ...entry, checking: false, canOpenRecovered: true,
    receipt: { id: recovery.sectionId, code }, message:
      `Identified section ${recovery.sectionId} is currently readable in document ${recovery.documentId}. Open it to review the saved record; no additional creation was requested.` });
}

export function useAuthoringCreation(options: Options) {
  const ledger = useCreationLedger(options);
  const refusal = ledger.ownerCurrent() ? creationRefusal(options) : accountChanged;
  const state = (kind: CreationKind): CreationState | undefined => ledger.read(kind);
  const blocked = (kind: CreationKind) => !!refusal || ['pending', 'unknown'].includes(state(kind)?.phase ?? '')
    || state(kind === 'document' ? 'section' : 'document')?.phase === 'pending';
  const create = (kind: CreationKind, values: Record<string, unknown>, finished: () => void, templateLabel?: string) => {
    if (blocked(kind) || !ledger.current() || (kind === 'section' && !options.docId)) return;
    const request = kind === 'document' ? { ...values, client_program_id: options.programId }
      : { ...values, doc_id: options.docId, content: '' };
    void executeCreation({ kind, request, finished, templateLabel }, options, ledger);
  };
  return { state, refusal, blocked, create,
    check: (kind: CreationKind) => void checkCreation(kind, options, ledger),
    open: (kind: CreationKind) => {
      const entry = ledger.read(kind);
      const receipt = entry?.receipt;
      if (receipt && !entry?.checking && (entry?.phase === 'created' || entry?.canOpenRecovered) && ledger.current() && recoveryCurrent(entry!, options, ledger) && !refusal) void openReceipt(kind, receipt, options, ledger.current);
    },
  };
}
