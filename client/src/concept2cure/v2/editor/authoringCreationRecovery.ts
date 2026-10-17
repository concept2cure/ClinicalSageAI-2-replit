/** Component-owned attempt identity shared by native and specialist creation.
 * No persistence or request semantics: adapters own scope admission and reads. */
import { useEffect, useReducer, useRef } from 'react';

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
): AuthoringAttemptLedger<K, E> {
  const context = useRef({ scope, generation: 0, alive: true });
  if (context.current.scope !== scope) context.current = { scope, generation: context.current.generation + 1, alive: true };
  const generation = context.current.generation;
  const entries = useRef(new Map<string, E>());
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    context.current.alive = true;
    return () => { context.current.alive = false; };
  }, []);
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
export function readAuthoringCreationRecovery(value: unknown, organizationId: unknown, programId: string | null): AuthoringCreationRecoveryIdentity | null {
  const body = creationObject(value);
  const recovery = creationObject(body?.recovery);
  const outcome = body?.creationOutcome;
  const code = outcome === 'unconfirmed' ? 'AUTHORING_CREATE_COMMIT_UNCONFIRMED'
    : outcome === 'committed' ? 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE' : null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const org = Number(organizationId);
  if (!code || body?.code !== code || body.ok !== false || body.retryAllowed !== false || !recovery
    || !Number.isSafeInteger(org) || org <= 0 || recovery.organizationId !== org
    || typeof recovery.documentId !== 'string' || !uuid.test(recovery.documentId)
    || recovery.programId !== programId) return null;
  return { documentId: recovery.documentId, organizationId: org, programId, creationOutcome: outcome as 'unconfirmed' | 'committed' };
}
