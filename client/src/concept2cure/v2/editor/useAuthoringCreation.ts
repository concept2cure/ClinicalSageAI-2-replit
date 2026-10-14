import { useEffect, useReducer, useRef } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { shellProgramId } from '../shellProject';
import { unboundNotice } from '../governanceNotice';

export type CreationKind = 'document' | 'section';
type Receipt = { id: string; title: string } | { id: string; code: string };
type Phase = 'pending' | 'unknown' | 'failed' | 'created';
export interface CreationState {
  phase: Phase;
  message: string;
  receipt?: Receipt;
  checking?: boolean;
}
interface Entry extends CreationState { attempt: object }
interface Options {
  programId: string | null;
  openProject: string | null;
  docId: string | null;
  programSwitchHeld: boolean;
  fireToast: (message: string, tone?: 'ok' | 'error') => void;
  onDocCreated: (document: { id: string; title: string }) => void;
  onSectionCreated: (section: { id: string; code: string }) => void;
  onCheckCreation?: (kind: CreationKind) => void | Promise<void>;
}
interface Ledger {
  read: (kind: CreationKind) => Entry | undefined;
  record: (kind: CreationKind, entry: Entry) => void;
  current: () => boolean;
  visible: () => boolean;
}

const names = (kind: CreationKind) => kind === 'document' ? 'working documents' : 'document sections';
const unknownMessage = (kind: CreationKind) =>
  `Could not confirm whether the ${kind} was created. Check ${names(kind)} before creating another.`;

function creationRefusal({ programId, openProject, programSwitchHeld }: Options): string | null {
  if (!programId) return 'Open a project first — a document belongs to a project.';
  return programSwitchHeld || openProject !== programId
    ? 'Finish the project switch before creating a document or section.' : null;
}

/** Retain uncertain attempts on return to a project; never release a newer request. */
function useCreationLedger(options: Options): Ledger {
  const { programId, openProject, docId, programSwitchHeld } = options;
  const scope = `${programId}:${openProject}:${docId}:${programSwitchHeld}`;
  const context = useRef({ scope, generation: 0, alive: true });
  if (context.current.scope !== scope) context.current = { scope, generation: context.current.generation + 1, alive: true };
  const generation = context.current.generation;
  const entries = useRef(new Map<string, Entry>());
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    context.current.alive = true;
    return () => { context.current.alive = false; };
  }, []);
  const key = (kind: CreationKind) => `${kind}:${programId}${kind === 'section' ? `:${docId}` : ''}`;
  const visible = () => context.current.alive && context.current.scope === scope;
  return {
    read: kind => entries.current.get(key(kind)),
    record: (kind, entry) => { entries.current.set(key(kind), entry); if (visible()) redraw(); },
    visible,
    current: () => visible() && context.current.generation === generation && shellProgramId() === programId,
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

async function receiveCreation(kind: CreationKind, request: Record<string, unknown>, templateLabel?: string) {
  const response = await apiRequest('POST', `/api/authoring/${kind === 'document' ? 'docs' : 'sections'}`, request);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(serverMessage(body) ?? 'The server refused it.', response.status);
  const receipt = creationReceipt(kind, body, request);
  return receipt ? { receipt, message: creationMessage(kind, receipt, body, templateLabel) } : null;
}

function failedCreation(kind: CreationKind, error: unknown, attempt: object): Entry {
  const refused = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
  return { attempt, phase: refused ? 'failed' : 'unknown', message: refused
    ? `Couldn’t create the ${kind} — ${redactInternals(error.message, 'the server refused it')}. Nothing was created.`
    : unknownMessage(kind) };
}

async function executeCreation({ kind, request, finished, templateLabel }: {
  kind: CreationKind; request: Record<string, unknown>; finished: () => void; templateLabel?: string;
}, options: Options, ledger: Ledger) {
  const attempt = {};
  ledger.record(kind, { attempt, phase: 'pending', message: `Creating ${kind}…` });
  let result: Entry;
  try {
    const confirmed = await receiveCreation(kind, request, templateLabel);
    result = confirmed ? { attempt, phase: 'created', ...confirmed }
      : { attempt, phase: 'unknown', message: unknownMessage(kind) };
  } catch (error) { result = failedCreation(kind, error, attempt); }
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
  return !!entry && entry.phase === 'unknown' && !entry.checking && ledger.current() && !creationRefusal(options);
}

async function checkCreation(kind: CreationKind, options: Options, ledger: Ledger) {
  const entry = ledger.read(kind);
  if (!mayCheck(entry, options, ledger)) return;
  ledger.record(kind, { ...entry, checking: true });
  try {
    const path = kind === 'document' ? `/api/authoring/docs?status=all&programId=${encodeURIComponent(options.programId!)}`
      : `/api/authoring/docs/${encodeURIComponent(options.docId!)}/sections`;
    const response = await apiRequest('GET', path);
    const body: unknown = await response.json();
    if (!response.ok || !scopedRows(kind, body, options)) throw new Error('The scoped list could not be verified.');
    if (!sameAttempt(ledger, kind, entry)) return;
    await options.onCheckCreation?.(kind);
    if (!sameAttempt(ledger, kind, entry)) return;
    ledger.record(kind, { ...entry, checking: false, phase: 'failed', message:
      `Check the refreshed ${names(kind)} before starting another ${kind}. This read does not identify which request created a record.` });
  } catch {
    if (sameAttempt(ledger, kind, entry)) {
      ledger.record(kind, { ...entry, checking: false, message:
        `Could not check ${names(kind)}. Creation is still unconfirmed; another ${kind} has not been requested.` });
    }
  } finally {
    const pending = ledger.read(kind);
    if (pending?.attempt === entry.attempt && pending.checking) ledger.record(kind, { ...pending, checking: false });
  }
}

export function useAuthoringCreation(options: Options) {
  const ledger = useCreationLedger(options);
  const refusal = creationRefusal(options);
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
      const receipt = ledger.read(kind)?.receipt;
      if (receipt && ledger.current() && !refusal) void openReceipt(kind, receipt, options, ledger.current);
    },
  };
}
