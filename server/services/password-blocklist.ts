/**
 * The common-password and context checks a new password must pass (security
 * audit 2026-09-24, IAM-17; plan P1-2; NIST SP 800-63B §5.1.1.2: compare a
 * chosen secret against values known to be commonly used or expected, and
 * against context-specific words such as the user name and the service name).
 *
 * The list is bundled (`server/data/common-passwords.txt`): the ten thousand
 * most common passwords and the twelve-character-or-longer entries of the
 * NCSC's hundred-thousand list, both redistributed through SecLists (MIT).
 * Nothing leaves the process: no range query, no third party sees a hash of
 * anyone's password. A breach-corpus lookup (k-anonymity range query) is a
 * separate decision recorded on the work-order board.
 *
 * The composition rules make people decorate a common word rather than choose
 * a different one ("Password1234!"), so the candidate is compared bare and
 * with its leading and trailing decorations (digits, punctuation) removed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIST_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'common-passwords.txt');
/** A stripped core shorter than this is not compared: "ab" matching a list entry says nothing. */
const MIN_CORE_LENGTH = 4;
/** A context word shorter than this is not searched for: "al" appears in most passwords. */
const MIN_CONTEXT_WORD_LENGTH = 4;
/** Words that name this product; a password should not be built from them. */
const PRODUCT_WORDS = ['concept2cure', 'trialsage'];

let common: Set<string> | null = null;

function loadCommon(): Set<string> {
  if (common) return common;
  const text = readFileSync(LIST_PATH, 'utf8');
  common = new Set(
    text
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(l => l.length > 0 && !l.startsWith('#')),
  );
  return common;
}

/** The forms of a password that are compared with the list: as typed, and without its decorations. */
export function passwordCores(password: string): string[] {
  const lower = password.toLowerCase();
  const cores = new Set<string>([lower]);
  cores.add(lower.replace(/[^a-z0-9]+$/, ''));
  cores.add(lower.replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, ''));
  cores.add(lower.replace(/[0-9]+$/, '').replace(/[^a-z0-9]+$/, ''));
  cores.add(lower.replace(/[^a-z0-9]+/g, ''));
  cores.add(lower.replace(/[^a-z0-9]+/g, '').replace(/[0-9]+$/, ''));
  return [...cores].filter(c => c.length >= MIN_CORE_LENGTH);
}

/** Whether the password, bare or undecorated, is one of the commonly used ones. */
export function isCommonPassword(password: string): boolean {
  const list = loadCommon();
  return passwordCores(password).some(core => list.has(core));
}

export interface PasswordContext {
  email?: string | null;
  name?: string | null;
  organizationName?: string | null;
}

/** The words a password must not be built from: the address's local part, the person's name, the organisation's name, the product. */
export function contextWordsOf(context: PasswordContext = {}): string[] {
  const words = new Set<string>(PRODUCT_WORDS);
  const add = (value: string | null | undefined) => {
    for (const token of (value ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= MIN_CONTEXT_WORD_LENGTH) words.add(token);
    }
  };
  add(context.email?.split('@')[0]);
  add(context.name);
  add(context.organizationName);
  return [...words];
}

/** The context word the password contains, or null. */
export function contextWordIn(password: string, context: PasswordContext = {}): string | null {
  const lower = password.toLowerCase();
  const flat = lower.replace(/[^a-z0-9]+/g, '');
  return contextWordsOf(context).find(w => lower.includes(w) || flat.includes(w)) ?? null;
}

/** Test seam: forget the loaded list. */
export function resetPasswordBlocklistForTests(): void {
  common = null;
}
