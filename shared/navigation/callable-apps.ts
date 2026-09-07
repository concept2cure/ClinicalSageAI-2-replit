/**
 * Callable apps — the `@app` vocabulary, shared by the composer and the server.
 *
 * ── What an "app" is here ────────────────────────────────────────────────────
 * The constitution's Law 3: apps are callable capabilities, not destinations
 * you travel to. In this product the callable capabilities ARE the module
 * workstreams AnA can navigate to and operate (`NAVIGATION_TARGETS`, group
 * `module`), plus the two global capabilities that behave like tools rather
 * than places (deep research, the biostatistics workbench). Deriving the list
 * from the navigation contract — rather than hand-listing it a second time —
 * means an app can be mentioned only if AnA can actually reach it, and the
 * server resolves the same id the composer inserted.
 *
 * ── How a mention travels ────────────────────────────────────────────────────
 * The composer inserts `@<label>` into the message text. Nothing else rides
 * along: the SERVER parses the message with `parseAppMentions` against this
 * same vocabulary, folds the apps into tool selection, pins the self-drive
 * tools, and tells the model which apps were invoked. So a mention typed by
 * hand in any composer — the rail, the thread, the front door, an API caller —
 * means the same thing, and a label that is not in the vocabulary means
 * nothing (it is left as ordinary text, never guessed at).
 *
 * Pure data + pure functions; importable from client and server.
 */

import { NAVIGATION_TARGETS, type NavigationTarget } from './index';

export interface CallableApp {
  /** The navigation-target id AnA operates (`navigate_to` / `act_on_screen`). */
  id: string;
  /** What the person types after `@`. */
  label: string;
  description: string;
  /** Extra relevance terms for tool selection, beyond the label. */
  hint: string;
}

/** Global targets that are capabilities rather than places. */
const GLOBAL_CALLABLE: ReadonlySet<string> = new Set(['deep-research', 'biostat-workbench', 'biostatistics', 'crl-library']);

function toApp(t: NavigationTarget): CallableApp {
  return { id: t.id, label: t.label, description: t.description, hint: t.id.replace(/-/g, ' ') };
}

/** The vocabulary, longest label first so a longer label always wins a prefix tie when parsing. */
export const CALLABLE_APPS: readonly CallableApp[] = NAVIGATION_TARGETS
  .filter((t) => t.group === 'module' || GLOBAL_CALLABLE.has(t.id))
  .map(toApp)
  .sort((a, b) => b.label.length - a.label.length || a.label.localeCompare(b.label));

/** Case-insensitive lookup by label. */
export function findCallableApp(label: string): CallableApp | undefined {
  const needle = label.trim().toLowerCase();
  return CALLABLE_APPS.find((a) => a.label.toLowerCase() === needle);
}

/**
 * Apps a person is likely typing after `@`: label or id contains the query
 * (case-insensitive), shortest labels first so the exact match surfaces.
 */
export function searchCallableApps(query: string, limit = 8): CallableApp[] {
  const q = query.trim().toLowerCase();
  const pool = q
    ? CALLABLE_APPS.filter((a) => a.label.toLowerCase().includes(q) || a.id.includes(q.replace(/\s+/g, '-')))
    : [...CALLABLE_APPS];
  return pool
    .sort((a, b) => {
      const as = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.label.length - b.label.length || a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

export interface AppMention {
  app: CallableApp;
  /** Character offset of the `@` in the text. */
  index: number;
}

/**
 * Find every `@<label>` in a message that names a callable app. Labels can
 * contain spaces and punctuation, so matching is by the vocabulary's labels
 * (longest first) at each `@`, not by a word regex. Unknown labels are not
 * mentions. Each app is reported once, at its first occurrence.
 */
export function parseAppMentions(text: string): AppMention[] {
  if (!text || text.indexOf('@') === -1) return [];
  const lower = text.toLowerCase();
  const out: AppMention[] = [];
  const seen = new Set<string>();
  for (let i = lower.indexOf('@'); i !== -1; i = lower.indexOf('@', i + 1)) {
    // An @ inside a word (an e-mail address) is not a mention.
    if (i > 0 && /[\w.]/.test(lower[i - 1])) continue;
    const rest = lower.slice(i + 1);
    const app = CALLABLE_APPS.find((a) => {
      const l = a.label.toLowerCase();
      if (!rest.startsWith(l)) return false;
      const after = rest[l.length];
      return after === undefined || !/[a-z0-9]/.test(after);
    });
    if (app && !seen.has(app.id)) {
      seen.add(app.id);
      out.push({ app, index: i });
    }
  }
  return out;
}

/** The message with each recognised `@label` replaced by the label alone — what the model should read as the request. */
export function stripAppMentions(text: string): string {
  let out = text;
  for (const m of parseAppMentions(text).sort((a, b) => b.index - a.index)) {
    out = out.slice(0, m.index) + m.app.label + out.slice(m.index + 1 + m.app.label.length);
  }
  return out;
}
