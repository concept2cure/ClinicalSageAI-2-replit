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
