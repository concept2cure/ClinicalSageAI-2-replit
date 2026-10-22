import { useEffect, useRef, useState } from 'react';
import { SKILL_TURN_BUDGET } from '@shared/ana/skills';

/**
 * The skills a person picked for one AnA conversation (the composer's Skills
 * menu, ComposerSkills.tsx). They ride on every turn of that conversation as
 * the request's `skills`, and the server loads them ahead of what AnA selects
 * herself (server/services/ana/skills/selector.ts).
 *
 * Kept per conversation for the browser session only: a choice is a working
 * preference, not a record. A new conversation starts with none (AnA chooses);
 * once the server names the conversation, what was picked before its first
 * turn is kept under that name.
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
    if (keys.length === 0) delete all[threadKey];
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

/** The conversation's picked skills and a setter that keeps at most the turn's allowance. */
export function useConversationSkills(
  threadId: string | null
): [string[], (keys: string[]) => void] {
  const threadKey = threadId ?? NEW_THREAD;
  const [keys, setKeys] = useState<string[]>(() => cleaned(readAll()[threadKey]));
  const previousKey = useRef(threadKey);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    const before = previousKey.current;
    previousKey.current = threadKey;
    if (before === threadKey) return;
    const stored = cleaned(readAll()[threadKey]);
    if (before === NEW_THREAD && stored.length === 0) {
      // The conversation was just named: what was picked for its first turn is its choice.
      writeOne(threadKey, keysRef.current);
      writeOne(NEW_THREAD, []);
      return;
    }
    setKeys(stored);
  }, [threadKey]);

  const set = (next: string[]) => {
    const value = cleaned(next);
    writeOne(threadKey, value);
    setKeys(value);
  };
  return [keys, set];
}
