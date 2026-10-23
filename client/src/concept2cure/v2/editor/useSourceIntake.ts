/** One mounted source intake visit. A dispatched write is never cancelled by closing its UI. */
import { useEffect, useReducer, useRef, useState } from 'react';
import { authService } from '@/services/portal/authService';
import { capturedActorHeaders } from '@/utils/authToken';
import type { AuthoringImportSource, AuthoringSourceImportData, AuthoringSourceImportPreviewData } from '@shared/authoring/source-import';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { createBinaryImport, createWorkflowImport, inspectSourceImport, isWorkflowSource, previewWorkflowImport,
  workflowSourceKey, type SourceIntakeRequest } from '../authoringHandoff';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';
import { taskActorScope } from '../taskTarget';
import { useAuthoringReadSession } from './authoringCurrentRead';
import { useAuthoringAttemptLedger, type AuthoringAttemptLedger, type AuthoringCreationRecoveryIdentity } from './authoringCreationRecovery';

type Preview = AuthoringSourceImportPreviewData;
type Phase = 'previewing' | 'creating' | 'unknown' | 'checking' | 'checked' | 'saved' | 'refused' | 'ready';
interface IntakeAttempt {
  attempt: object;
  phase: Phase;
  preview?: Preview;
  data?: AuthoringSourceImportData;
  message?: string;
  recovery?: AuthoringCreationRecoveryIdentity;
  identifiedOutcome?: boolean;
  inventory?: Array<{ id: string; title: string }>;
}
const LANE = 'intake';
const RETIRED = 'This source intake belongs to an earlier account, session or project visit. Close it and reopen the source in the intended project. A save already sent may have completed; inspect working documents in the original project before creating another copy.';
const UNKNOWN = 'The server did not confirm this working copy. It may already have been saved. Check working documents in this project before creating another copy.';
const CHECKED = 'Working documents were read for this project. This list does not identify which request created a document. Inspect the project’s Author tab before choosing another deliberate create.';
const isBusy = (entry?: IntakeAttempt) => !!entry && ['previewing', 'creating', 'checking'].includes(entry.phase);
const isHeld = (entry?: IntakeAttempt) => entry?.phase === 'unknown' || entry?.phase === 'checking';
const validReason = (value: string) => value.trim().length >= GOVERNED_REASON_MIN && value.trim().length <= GOVERNED_REASON_MAX;
const sourceKey = (source: AuthoringImportSource) => `${source.kind}:${isWorkflowSource(source) ? workflowSourceKey(source)
  : source.kind === 'vault' ? source.documentId : source.sourceId}`;
function copySource(source: AuthoringImportSource): AuthoringImportSource {
  return source.kind === 'csr' ? { ...source, ...(source.sectionNumbers ? { sectionNumbers: [...source.sectionNumbers] } : {}) } : { ...source };
}

/** A live adopted bearer may rotate; the original account/session and project visit may not. */
function captureIntakeVisit(programId: string, source: AuthoringImportSource, latestSource: { current: { programId: string; source: AuthoringImportSource } }) {
  const account = authService.getUser();
  const scope = taskActorScope(account);
  const actor = scope ? { userId: Number(scope.userId), organizationId: Number(scope.organizationId) } : null;
  const session = authService.captureSessionReadGuard();
  const project = captureShellProjectGuard();
  const snapshot = copySource(source);
  const key = sourceKey(snapshot);
  let retired = false;
  const contextCurrent = () => {
    if (retired) return false;
    try {
      if (!actor || authService.getUser() !== account || !session.sameRevision() || !project()
        || shellProgramId()?.toLowerCase() !== programId.toLowerCase() || latestSource.current.programId !== programId
        || sourceKey(latestSource.current.source) !== key) throw new Error();
      const headers = capturedActorHeaders(actor);
      if (!authService.captureSessionReadGuard(headers.Authorization.slice('Bearer '.length)).current()) throw new Error();
      return true;
    } catch { retired = true; return false; }
  };
  return { actor, source: snapshot, contextCurrent };
}

interface IntakeActionContext {
  owner: ReturnType<typeof captureIntakeVisit>;
  programId: string;
  ledger: AuthoringAttemptLedger<typeof LANE, IntakeAttempt>;
  fields: { current: { reason: string; associationReason: string } };
  admit: () => boolean;
  request: () => SourceIntakeRequest | null;
}
function sourceIntakeActions({ owner, programId, ledger, fields, admit, request }: IntakeActionContext) {
  const refresh = async () => {
    if (!isWorkflowSource(owner.source) || !admit()) return;
    const previous = ledger.read(LANE);
    if (isBusy(previous) || isHeld(previous) || previous?.data) return;
    const transport = request();
    if (!transport) return;
    const attempt = {};
    if (!ledger.begin(LANE, { attempt, phase: 'previewing' }, () => isBusy(ledger.read(LANE)))) return;
    try {
      const reply = await previewWorkflowImport(programId, owner.source, transport);
      ledger.replaceIfOwned(LANE, attempt, reply.ok ? { attempt, phase: 'ready', preview: reply.data }
        : { attempt, phase: 'refused', message: reply.message });
    } catch {
      ledger.replaceIfOwned(LANE, attempt, { attempt, phase: 'refused', message: 'The saved source could not be read. Reload the source preview to try again.' });
    }
  };
  const ready = (entry?: IntakeAttempt) => !isBusy(entry) && !isHeld(entry) && !entry?.data && validReason(fields.current.reason)
    && (!isWorkflowSource(owner.source) || (!!entry?.preview && (!entry.preview.association.required || validReason(fields.current.associationReason))));
  const pull = async () => {
    if (!admit()) return;
    const previous = ledger.read(LANE);
    if (!ready(previous)) return;
    const transport = request();
    if (!transport) return;
    const attempt = {};
    const pending: IntakeAttempt = { attempt, phase: 'creating', preview: previous?.preview };
    if (!ledger.begin(LANE, pending, () => !ready(ledger.read(LANE)))) return;
    try {
      const reply = isWorkflowSource(owner.source) && pending.preview
        ? await createWorkflowImport(programId, owner.source, pending.preview, fields.current.reason.trim(),
          { request: transport, associationReason: fields.current.associationReason.trim() })
        : await createBinaryImport(programId, owner.source, fields.current.reason.trim(), transport);
      ledger.replaceIfOwned(LANE, attempt, reply.ok ? { ...pending, phase: 'saved', data: reply.data }
        : { ...pending, phase: reply.phase === 'unknown' ? 'unknown' : 'refused', message: reply.message,
          recovery: reply.recovery, identifiedOutcome: reply.identifiedOutcome,
          preview: reply.phase === 'unknown' ? pending.preview : undefined });
    } catch {
      ledger.replaceIfOwned(LANE, attempt, { ...pending, phase: 'unknown', message: UNKNOWN });
    }
  };
  const check = async () => {
    if (!admit()) return;
    const unknown = ledger.read(LANE);
    if (unknown?.phase !== 'unknown') return;
    const transport = request();
    if (!transport) return;
    const attempt = {};
    if (!ledger.begin(LANE, { ...unknown, attempt, phase: 'checking' }, () => ledger.read(LANE)?.phase !== 'unknown')) return;
    try {
      const reply = await inspectSourceImport(programId, owner.source, unknown, transport);
      const entry: IntakeAttempt = reply.ok ? (reply.data
        ? { ...unknown, attempt, phase: 'saved', data: reply.data, message: undefined }
        : { attempt, phase: 'checked', message: CHECKED, inventory: reply.inventory })
        : { ...unknown, attempt, phase: 'unknown', message: reply.message };
      ledger.replaceIfOwned(LANE, attempt, entry);
    } catch {
      ledger.replaceIfOwned(LANE, attempt, { ...unknown, attempt, phase: 'unknown', message: 'Working documents could not be checked. The earlier save may have completed; check again before creating another copy.' });
    }
  };
  return { refresh, pull, check, ready };
}
function intakeView(entry: IntakeAttempt | undefined, admitted: boolean, reason: string, associationReason: string) {
  return {
    reason: admitted ? reason : '', associationReason: admitted ? associationReason : '',
    busy: isBusy(entry), held: isHeld(entry), retired: !admitted, result: entry?.data ?? null, preview: entry?.preview ?? null,
    error: entry?.phase === 'refused' ? entry.message : null,
    recoveryMessage: entry && ['unknown', 'checking', 'checked'].includes(entry.phase) ? entry.message ?? UNKNOWN : null,
    checked: entry?.phase === 'checked', retirementMessage: RETIRED, inventory: entry?.inventory,
    activity: entry?.phase,
  };
}

export function useSourceIntake(programId: string, source: AuthoringImportSource) {
  useAuthoringReadSession(authService.getUser());
  useShellProject();
  const alive = useRef(true);
  const latestSource = useRef({ programId, source });
  latestSource.current = { programId, source };
  const visit = useRef<ReturnType<typeof captureIntakeVisit> | null>(null);
  if (!visit.current) visit.current = captureIntakeVisit(programId, source, latestSource);
  const owner = visit.current;
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const current = () => alive.current && owner.contextCurrent();
  const ledger = useAuthoringAttemptLedger<typeof LANE, IntakeAttempt>('source-intake', () => LANE, current);
  const [reason, updateReason] = useState('');
  const [associationReason, updateAssociationReason] = useState('');
  const fields = useRef({ reason, associationReason });
  fields.current = { reason, associationReason };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const admit = () => {
    if (ledger.current()) return true;
    if (alive.current) redraw();
    return false;
  };
  const request = (): SourceIntakeRequest | null => {
    if (!admit() || !owner.actor) return null;
    const headers = capturedActorHeaders(owner.actor);
    return current() ? { actor: owner.actor, headers, current } : null;
  };
  const setReason = (value: string) => {
    if (admit() && !isBusy(ledger.read(LANE)) && !isHeld(ledger.read(LANE))) updateReason(value);
  };
  const setAssociationReason = (value: string) => {
    if (admit() && !isBusy(ledger.read(LANE)) && !isHeld(ledger.read(LANE))) updateAssociationReason(value);
  };
  const actions = sourceIntakeActions({ owner, programId, ledger, fields, admit, request });
  const refreshRef = useRef(actions.refresh);
  refreshRef.current = actions.refresh;
  useEffect(() => { void refreshRef.current(); }, []);
  const admitted = current();
  const entry = admitted ? ledger.read(LANE) : undefined;
  return {
    ...intakeView(entry, admitted, reason, associationReason), ...actions, setReason, setAssociationReason,
    canCreate: admitted && actions.ready(entry),
    canClose: () => !current() || !isBusy(ledger.read(LANE)),
    current: admit, contextCurrent: owner.contextCurrent,
  };
}
