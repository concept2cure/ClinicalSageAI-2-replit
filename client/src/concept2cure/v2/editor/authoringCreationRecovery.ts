/** Component-owned attempt identity shared by native and specialist creation.
 * No persistence or request semantics: adapters own scope admission and reads. */
import { useEffect, useReducer, useRef } from 'react';
import { registerSurfaceLeaveGuard } from '../navParams';

export interface AuthoringAttempt { attempt: object }
export interface AuthoringAttemptLedger<K, E extends AuthoringAttempt> {
  read: (lane: K) => E | undefined;
  record: (lane: K, entry: E) => void;
  begin: (lane: K, entry: E, blocked?: () => boolean) => boolean;
  owns: (lane: K, attempt: object) => boolean;
  replaceIfOwned: (lane: K, attempt: object, entry: E) => boolean;
  current: () => boolean;
  visible: () => boolean;
}

/** Old owners may retain an uncertain result, but cannot redraw a new scope or
 * release another token. Scope generations catch rendered round trips. */
export function useAuthoringAttemptLedger<K, E extends AuthoringAttempt>(
  scope: string, key: (lane: K) => string, admitted: () => boolean,
  leaveRefusal?: (entries: Iterable<E>) => string | null,
): AuthoringAttemptLedger<K, E> {
  const context = useRef({ scope, generation: 0, alive: true });
  if (context.current.scope !== scope) context.current = { scope, generation: context.current.generation + 1, alive: true };
  const generation = context.current.generation;
  const entries = useRef(new Map<string, E>());
  const leaveRefusalRef = useRef(leaveRefusal);
  leaveRefusalRef.current = leaveRefusal;
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    context.current.alive = true;
    return () => { context.current.alive = false; };
  }, []);
  // Consult every retained lane synchronously, including prior scopes whose
  // creation form closed while a request or recovery remained unresolved.
  useEffect(() => registerSurfaceLeaveGuard(() => context.current.alive
    ? leaveRefusalRef.current?.(entries.current.values()) ?? null : null), []);
  const visible = () => context.current.alive && context.current.scope === scope;
  const current = () => visible() && context.current.generation === generation && admitted();
  const read = (lane: K) => entries.current.get(key(lane));
  const record = (lane: K, entry: E) => { entries.current.set(key(lane), entry); if (visible()) redraw(); };
  const owns = (lane: K, attempt: object) => read(lane)?.attempt === attempt;
  return { read, record, visible, current, owns,
    begin: (lane, entry, blocked) => {
      if (!current() || blocked?.()) return false;
      record(lane, entry); return true;
    },
    replaceIfOwned: (lane, attempt, entry) => {
      if (!owns(lane, attempt)) return false;
      record(lane, entry); return true;
    },
  };
}

/** Recovery identifiers locate an attempted record; they are never a saved receipt. */
export interface AuthoringCreationRecoveryIdentity {
  documentId: string;
  organizationId: number;
  programId: string | null;
  creationOutcome: 'unconfirmed' | 'committed';
}
const creationObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function hasAuthoringCreationOutcome(value: unknown): boolean {
  const body = creationObject(value);
  return body?.code === 'AUTHORING_CREATE_COMMIT_UNCONFIRMED' || body?.code === 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE';
}
const RECOVERY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recoveryUuid = (value: unknown): value is string => typeof value === 'string' && RECOVERY_UUID.test(value);
function recoveryEnvelope(value: unknown, organizationId: unknown) {
  const body = creationObject(value);
  const recovery = creationObject(body?.recovery);
  const org = Number(organizationId);
  if (body?.ok !== false || body.retryAllowed !== false || !recovery
    || !Number.isSafeInteger(org) || org <= 0 || recovery.organizationId !== org) return null;
  return { body, recovery, org };
}
export function readAuthoringCreationRecovery(value: unknown, organizationId: unknown, programId: string | null): AuthoringCreationRecoveryIdentity | null {
  const envelope = recoveryEnvelope(value, organizationId);
  if (!envelope) return null;
  const { body, recovery, org } = envelope;
  const outcome = body.creationOutcome;
  const code = outcome === 'unconfirmed' ? 'AUTHORING_CREATE_COMMIT_UNCONFIRMED'
    : outcome === 'committed' ? 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE' : null;
  if (!code || body.code !== code || !recoveryUuid(recovery.documentId) || recovery.programId !== programId) return null;
  return { documentId: recovery.documentId, organizationId: org, programId, creationOutcome: outcome as 'unconfirmed' | 'committed' };
}

export interface AuthoringSectionCreationRecoveryIdentity {
  documentId: string;
  organizationId: number;
  sectionId: string;
  /** Captured UI scope; the section recovery response does not assert a program. */
  programId: string;
}
export function hasAuthoringSectionCreationOutcome(value: unknown): boolean {
  return creationObject(value)?.code === 'AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED';
}
export function readAuthoringSectionCreationRecovery(value: unknown, organizationId: unknown,
  documentId: string | null, programId: string | null): AuthoringSectionCreationRecoveryIdentity | null {
  const envelope = recoveryEnvelope(value, organizationId);
  if (!envelope) return null;
  const { body, recovery, org } = envelope;
  if (!hasAuthoringSectionCreationOutcome(body) || body.writeOutcome !== 'unconfirmed'
    || !recoveryUuid(programId) || !recoveryUuid(documentId) || recovery.documentId !== documentId
    || !recoveryUuid(recovery.sectionId)) return null;
  return { documentId, organizationId: org, sectionId: recovery.sectionId, programId };
}
