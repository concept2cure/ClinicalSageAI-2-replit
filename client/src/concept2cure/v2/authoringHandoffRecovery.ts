/** Explicit, component-owned recovery for the canonical two-stage writer. */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { shellProgramId, useShellProject } from './shellProject';
import { clearEditorTarget, setEditorTarget } from './editorTarget';
import { useAuthoringAttemptLedger, type AuthoringAttemptLedger } from './editor/authoringCreationRecovery';
import type { AuthoringHandoff, AuthoringHandoffResult, HandoffContext } from './authoringHandoff';

export interface AuthoringHandoffRecoveryState {
  phase: 'pending' | 'unknown' | 'partial' | 'refused' | 'saved' | 'checked';
  message: string;
  docId?: string;
  checking?: boolean;
  continuing?: boolean;
  canContinue?: boolean;
  canOpen?: boolean;
  inventory?: Array<{ id: string; title: string }>;
}
export interface AuthoringHandoffController {
  save: (input: AuthoringHandoff) => Promise<AuthoringHandoffResult>;
  state: AuthoringHandoffRecoveryState | undefined;
  blocked: boolean;
  check: () => Promise<void>;
  continueSaving: () => Promise<void>;
  open: (onNav: (id: string) => void) => boolean;
  openWorkingDocuments: (onNav: (id: string) => void) => boolean;
}
interface Entry extends AuthoringHandoffRecoveryState {
  attempt: object;
  payload: AuthoringHandoff;
  result?: AuthoringHandoffResult;
  inspectionCode?: string;
}
type Ledger = AuthoringAttemptLedger<'handoff', Entry>;
interface Ports {
  save: (input: AuthoringHandoff, mounted: () => boolean) => Promise<AuthoringHandoffResult>;
  capture: (code: string, mounted: () => boolean) => HandoffContext;
  continueText: (input: AuthoringHandoff, context: HandoffContext, docId: string) => Promise<AuthoringHandoffResult>;
}
interface Owner { ledger: Ledger; ports: Ports; mounted: () => boolean }
interface Inspection { inventory: Array<{ id: string; title: string }>; code?: string }
const lane = 'handoff';
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const codeKey = (code: string) => code.trim().toUpperCase();
const accountKey = () => `${authService.getUser()?.organizationId ?? ''}:${authService.getUser()?.id ?? ''}`;
const held = (entry: Entry | undefined) => !!entry && (['pending', 'unknown', 'partial'].includes(entry.phase) || !!entry.checking || !!entry.continuing);
const samePayload = (a: AuthoringHandoff, b: AuthoringHandoff) =>
  a.title === b.title && a.module === b.module && a.code === b.code && a.content === b.content;
const current = (owner: Owner, context: HandoffContext, entry: Entry) =>
  owner.ledger.current() && context.isCurrent() && owner.ledger.owns(lane, entry.attempt);

async function readBody(path: string, context: HandoffContext): Promise<Record<string, unknown>> {
  const response = await apiRequest('GET', path);
  if (!context.isCurrent()) throw new Error('The working context changed.');
  const body = object(await response.json());
  if (!context.isCurrent() || !response.ok || body?.success !== true) throw new Error('The read was not confirmed.');
  return body;
}
async function readInventory(context: HandoffContext): Promise<Inspection['inventory']> {
  const body = await readBody(`/api/authoring/docs?status=all&programId=${encodeURIComponent(context.programId!)}`, context);
  const rows = body.documents;
  if (!Array.isArray(rows) || !rows.every(row => {
    const value = object(row); return value && text(value.id) && typeof value.title === 'string' && value.program_id === context.programId;
  })) throw new Error('The project inventory could not be verified.');
  return rows.map(row => ({ id: row.id as string, title: row.title as string }));
}
async function inspectKnown(entry: Entry, context: HandoffContext): Promise<Inspection> {
  const inventory = await readInventory(context);
  if (!inventory.some(row => row.id === entry.docId)) throw new Error('The document is not in this project inventory.');
  const path = `/api/authoring/docs/${encodeURIComponent(entry.docId!)}`;
  const detail = object((await readBody(path, context)).document);
  if (!detail || detail.id !== entry.docId || typeof detail.title !== 'string') throw new Error('The exact document could not be verified.');
  const rows = (await readBody(`${path}/sections`, context)).sections;
  if (!Array.isArray(rows) || !rows.every(row => {
    const value = object(row); return value && text(value.id) && value.doc_id === entry.docId
      && text(value.code) && typeof value.title === 'string' && (typeof value.content === 'string' || value.content === null);
  })) throw new Error('The document sections could not be verified.');
  const matching = rows.filter(row => codeKey(row.code as string) === codeKey(entry.payload.code));
  if (matching.length > 1) throw new Error('The section code occurs more than once. Inspect the document.');
  return { inventory, ...(matching.length ? { code: matching[0].code as string } : {}) };
}
function inspectionState(entry: Entry, inspection: Inspection): Entry {
  return { ...entry, phase: 'partial', checking: false, continuing: false, inventory: inspection.inventory,
    inspectionCode: inspection.code, canOpen: true, canContinue: inspection.code === undefined,
    message: inspection.code === undefined
      ? `The confirmed document “${entry.payload.title}” is present and section “${entry.payload.code}” is absent. Review it or explicitly continue saving its original text. No new document was requested.`
      : 'This document already contains the section code. Its current text is preserved; this read does not identify which request created it. Open the document to review it.' };
}
function failedCheck(entry: Entry): Entry {
  return { ...entry, phase: entry.docId ? 'partial' : 'unknown', checking: false, continuing: false,
    canContinue: false, canOpen: false,
    message: 'Could not verify the current working document and sections. The save remains unresolved; no additional write was requested.' };
}
function resultState(entry: Entry, result: AuthoringHandoffResult): Entry {
  return { ...entry, result, message: result.message, docId: result.docId,
    phase: result.ok ? 'saved' : result.phase === 'refused' ? 'refused' : result.docId ? 'partial' : 'unknown',
    canOpen: result.ok, canContinue: false, checking: false, continuing: false,
    inspectionCode: result.ok ? result.code : undefined };
}
function blockedResult(context: HandoffContext): AuthoringHandoffResult {
  return { ...context, ok: false, phase: 'blocked', message: 'A save is pending or unresolved. Check the existing recovery notice before requesting another copy.' };
}
/** A response may retain its receipt without owning a caller's effects. */
function admittedResult(owner: Owner, entry: Entry, result: AuthoringHandoffResult): AuthoringHandoffResult {
  const isCurrent = () => result.isCurrent() && owner.ledger.current() && owner.ledger.owns(lane, entry.attempt);
  return isCurrent() ? { ...result, isCurrent } : { ...result, isCurrent, ok: false, phase: 'stale',
    message: 'The save no longer owns the current working context. Check the recovery notice in its original project before requesting another copy.' };
}
async function reuseSaved(owner: Owner, entry: Entry, context: HandoffContext): Promise<AuthoringHandoffResult> {
  const checking = { ...entry, attempt: {}, phase: 'pending' as const, checking: true, canOpen: false };
  if (!owner.ledger.begin(lane, checking, () => held(owner.ledger.read(lane)))) return blockedResult(context);
  try {
    const inspected = await inspectKnown(checking, context);
    if (!current(owner, context, checking)) return blockedResult(context);
    if (inspected.code === undefined) {
      owner.ledger.record(lane, inspectionState(checking, inspected));
      return admittedResult(owner, checking, { ...context, ok: false, phase: 'partial', docId: checking.docId, message: owner.ledger.read(lane)!.message });
    }
    const result: AuthoringHandoffResult = { ...context, ok: true, programId: context.programId!, docId: checking.docId!, bound: null,
      reused: true, code: inspected.code, message: `Using the existing working document “${entry.payload.title}”. Its current text is preserved; filing binding was not rechecked.` };
    owner.ledger.record(lane, { ...resultState(checking, result), inventory: inspected.inventory }); return admittedResult(owner, checking, result);
  } catch {
    if (current(owner, context, checking)) owner.ledger.record(lane, failedCheck(checking));
    return admittedResult(owner, checking, { ...context, ok: false, phase: 'unknown', docId: checking.docId, message: failedCheck(checking).message });
  } finally { settleChecking(owner, checking); }
}
function settleChecking(owner: Owner, entry: Entry) {
  const latest = owner.ledger.read(lane);
  if (latest?.attempt === entry.attempt && (latest.checking || latest.continuing)) {
    owner.ledger.record(lane, latest.phase === 'pending' ? failedCheck(latest) : { ...latest, checking: false, continuing: false });
  }
}
async function save(owner: Owner, input: AuthoringHandoff): Promise<AuthoringHandoffResult> {
  const context = owner.ports.capture(input.code, owner.mounted);
  const previous = owner.ledger.read(lane);
  if (held(previous) || !owner.ledger.current()) return blockedResult(context);
  if (previous?.phase === 'saved' && samePayload(previous.payload, input)) return reuseSaved(owner, previous, context);
  const entry: Entry = { attempt: {}, payload: { ...input }, phase: 'pending', message: 'Saving working document…' };
  if (!owner.ledger.begin(lane, entry, () => held(owner.ledger.read(lane)))) return blockedResult(context);
  const result = await owner.ports.save(entry.payload, owner.mounted);
  owner.ledger.replaceIfOwned(lane, entry.attempt, resultState(entry, result));
  return admittedResult(owner, entry, result);
}
async function check(owner: Owner): Promise<void> {
  const entry = owner.ledger.read(lane);
  if (!entry || !['unknown', 'partial'].includes(entry.phase) || entry.checking || entry.continuing || !owner.ledger.current()) return;
  const context = owner.ports.capture(entry.payload.code, owner.mounted);
  if (!context.programId || !context.isCurrent()) return;
  owner.ledger.record(lane, { ...entry, checking: true, canContinue: false, canOpen: false });
  try {
    const inspection = entry.docId ? await inspectKnown(entry, context) : { inventory: await readInventory(context) };
    if (!current(owner, context, entry)) return;
    owner.ledger.record(lane, entry.docId ? inspectionState(entry, inspection) : { ...entry, phase: 'checked', checking: false,
      inventory: inspection.inventory, message: 'Check these working documents before requesting another copy. This read cannot identify the interrupted request or prove that nothing was saved. Another creation is a deliberate choice.' });
  } catch { if (current(owner, context, entry)) owner.ledger.record(lane, failedCheck(entry)); }
  finally { settleChecking(owner, entry); }
}
async function continueSaving(owner: Owner): Promise<void> {
  const entry = owner.ledger.read(lane);
  if (!entry?.docId || !entry.canContinue || entry.checking || entry.continuing || !owner.ledger.current()) return;
  const context = owner.ports.capture(entry.payload.code, owner.mounted);
  if (!context.isCurrent()) return;
  const continuing = { ...entry, attempt: {}, continuing: true, canContinue: false, canOpen: false };
  owner.ledger.record(lane, continuing);
  try {
    // Recheck at the explicit write action: another actor may have saved text
    // since Check. Reads never authorize an overwrite or a new document.
    const inspection = await inspectKnown(continuing, context);
    if (!current(owner, context, continuing)) return;
    if (inspection.code !== undefined) { owner.ledger.record(lane, inspectionState(continuing, inspection)); return; }
    const result = await owner.ports.continueText(entry.payload, context, entry.docId);
    if (owner.ledger.owns(lane, continuing.attempt)) owner.ledger.record(lane, resultState(continuing, result));
  } catch { if (current(owner, context, continuing)) owner.ledger.record(lane, failedCheck(continuing)); }
  finally { settleChecking(owner, continuing); }
}
function open(owner: Owner, onNav: (id: string) => void, inventoryOnly = false): boolean {
  const entry = owner.ledger.read(lane);
  if (!entry || !owner.ledger.current() || entry.checking || entry.continuing) return false;
  const context = owner.ports.capture(entry.payload.code, owner.mounted);
  if (!context.programId || !context.isCurrent()) return false;
  if (inventoryOnly) {
    if (!entry.inventory) return false;
    clearEditorTarget();
  } else {
    if (!entry.canOpen || !entry.docId) return false;
    setEditorTarget({ docType: null, docId: entry.docId, programId: context.programId, ...(entry.inspectionCode ? { code: entry.inspectionCode } : {}) });
  }
  onNav('document-authoring'); return true;
}
function useOwnerSession() {
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const session = useRef({ guard: authService.captureSessionReadGuard(), generation: 0 });
  if (!session.current.guard.sameRevision()) session.current = { guard: authService.captureSessionReadGuard(), generation: session.current.generation + 1 };
  useEffect(() => {
    const stops = (['login', 'logout', 'session_expired', 'user_updated'] as const).map(event => authService.on(event, redraw));
    return () => { stops.forEach(stop => stop()); };
  }, []);
  return session.current;
}
export function useAuthoringHandoffController(ports: Ports): AuthoringHandoffController {
  const program = shellProgramId(useShellProject());
  const actor = accountKey();
  const session = useOwnerSession();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scope = `${session.generation}:${actor}:${program}`;
  const ledger = useAuthoringAttemptLedger<'handoff', Entry>(scope, () => scope,
    () => shellProgramId() === program && accountKey() === actor && session.guard.sameRevision());
  const owner = useRef<Owner>({ ledger, ports, mounted: () => alive.current });
  owner.current = { ledger, ports, mounted: () => alive.current };
  const stableSave = useCallback((input: AuthoringHandoff) => save(owner.current, input), []);
  const stableCheck = useCallback(() => check(owner.current), []);
  const stableContinue = useCallback(() => continueSaving(owner.current), []);
  const stableOpen = useCallback((onNav: (id: string) => void) => open(owner.current, onNav), []);
  const stableInventory = useCallback((onNav: (id: string) => void) => open(owner.current, onNav, true), []);
  const entry = ledger.read(lane);
  return { save: stableSave, state: entry, blocked: held(entry), check: stableCheck, continueSaving: stableContinue,
    open: stableOpen, openWorkingDocuments: stableInventory };
}
