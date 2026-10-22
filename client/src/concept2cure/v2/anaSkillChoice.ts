import { useEffect, useRef, useState } from 'react';
import { SKILL_TURN_BUDGET } from '@shared/ana/skills';

/**
 * The skills a person picked for one AnA conversation (the composer's Skills
 * menu, ComposerSkills.tsx). They ride on every turn of that conversation as
 * the request's `skills`, and the server loads them ahead of what AnA selects
 * herself (server/services/ana/skills/selector.ts).
 *
 * Kept per conversation in the browser session, and on the conversation's
 * thread: the stream records each turn's `skills` there and the thread's read
 * returns them (`threadSkills` from useAnaChat), so a conversation reopened in
 * another browser or tab starts from its picks. What this browser picked wins
 * over the thread's record: it is the newer choice. A choice is a working
 * preference, not a record; what each turn loaded is on its turn record.
 *
 * A new conversation starts with none (AnA chooses); once the server names the
 * conversation, what was picked before its first turn is kept under that name.
 * `touched` says whether this conversation has a choice to send at all: once
 * it has had picks, an empty list is sent too, so letting AnA choose again is
 * recorded on the thread.
 */

const STORE_KEY = 'c2c.ana-skills.v1';
const NEW_THREAD = '__new__';

function readAll(): Record<string, string[]> {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string[]>)
      : {};
  } catch {
    return {};
  }
}

function writeOne(threadKey: string, keys: string[]): void {
  try {
    const all = readAll();
    // An empty list is kept: it records that the person let AnA choose again.
    if (threadKey === NEW_THREAD && keys.length === 0) delete all[threadKey];
    else all[threadKey] = keys;
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* Storage refused (private mode, quota): the choice still holds for this view. */
  }
}

function cleaned(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return Array.from(
    new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0))
  ).slice(0, SKILL_TURN_BUDGET.maxChosen);
}

function storedFor(threadKey: string): string[] | null {
  const all = readAll();
  return Object.prototype.hasOwnProperty.call(all, threadKey) ? cleaned(all[threadKey]) : null;
}

/**
 * The conversation's picked skills, a setter that keeps at most the turn's
 * allowance, and whether the conversation has a choice to send. `kept` is the
 * thread's record of its picks, once its read returns.
 */
export function useConversationSkills(
  threadId: string | null,
  kept?: { threadId: string; keys: string[] } | null
): [string[], (keys: string[]) => void, boolean] {
  const threadKey = threadId ?? NEW_THREAD;
  const [keys, setKeys] = useState<string[]>(() => storedFor(threadKey) ?? []);
  const [touched, setTouched] = useState<boolean>(() => storedFor(threadKey) !== null);
  const previousKey = useRef(threadKey);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    const before = previousKey.current;
    previousKey.current = threadKey;
    if (before === threadKey) return;
    const stored = storedFor(threadKey);
    if (before === NEW_THREAD && stored === null) {
      // The conversation was just named: what was picked for its first turn is its choice.
      if (keysRef.current.length > 0) writeOne(threadKey, keysRef.current);
      writeOne(NEW_THREAD, []);
      return;
    }
    setKeys(stored ?? []);
    setTouched(stored !== null);
  }, [threadKey]);

  // The thread's record, when this browser holds no choice of its own for it.
  // Adopted once per conversation: storage can refuse the write (private
  // mode), and a host may hand a fresh record object on every render.
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!kept || kept.threadId !== threadId || adopted.current === kept.threadId) return;
    if (storedFor(kept.threadId) !== null) return;
    adopted.current = kept.threadId;
    const value = cleaned(kept.keys);
    writeOne(kept.threadId, value);
    setKeys(value);
    setTouched(true);
  }, [kept, threadId]);

  const set = (next: string[]) => {
    const value = cleaned(next);
    writeOne(threadKey, value);
    setKeys(value);
    setTouched(true);
  };
  return [keys, set, touched];
}
