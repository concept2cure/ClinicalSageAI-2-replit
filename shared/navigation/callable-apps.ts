/**
 * Callable apps — the ONE `@app` vocabulary, shared by the composer and the server.
 *
 * ── What an "app" is here ────────────────────────────────────────────────────
 * The constitution's Law 3: apps are callable capabilities, not destinations
 * you travel to. In this product the callable capabilities ARE the module
 * workstreams AnA can navigate to and operate (`NAVIGATION_TARGETS`, group
 * `module`), plus a few global or project screens that behave like tools
 * rather than places (deep research, the vault, the biostatistics workbench,
 * the CRL library). Deriving the list from the navigation contract — rather
 * than hand-listing it a second time — means an app can be mentioned only if
 * AnA can actually reach it, and the server resolves the same id the composer
 * inserted.
 *
 * ── Handles ──────────────────────────────────────────────────────────────────
 * An app answers to its label (`@Biostatistics workbench`, what the composer
 * inserts), its navigation id (`@biostat-workbench`), and any short alias
 * (`@biostats`). The aliases are the handles AnA's context enrichment has
 * accepted since before the composer offered a menu; they live here so there
 * is one vocabulary, not a client one and a server one that drift.
 *
 * ── How a mention travels ────────────────────────────────────────────────────
 * The composer inserts `@<label>` into the message text. Nothing else rides
 * along: the SERVER parses the message with `parseAppMentions` against this
 * same vocabulary, folds the apps into tool selection, pins the self-drive
 * tools, enriches context for the app, and tells the model which apps were
 * invoked. So a mention typed by hand in any composer — the rail, the thread,
 * the front door, an API caller — means the same thing, and a handle that is
 * not in the vocabulary means nothing (it is left as ordinary text, never
 * guessed at).
 *
 * Pure data + pure functions; importable from client and server.
 */

import { NAVIGATION_TARGETS, type NavigationTarget } from './index';

export interface CallableApp {
  /** The navigation-target id AnA operates (`navigate_to` / `act_on_screen`). */
  id: string;
  /** What the composer inserts after `@`. */
  label: string;
  description: string;
  /** Short handles that also name this app after `@`, lower case. */
  aliases: readonly string[];
  /** Extra relevance terms for tool selection, beyond the label. */
  hint: string;
}

/** Targets outside group `module` that are capabilities rather than places. */
const EXTRA_CALLABLE: ReadonlySet<string> = new Set([
  'deep-research', 'biostat-workbench', 'biostatistics', 'crl-library', 'vault',
]);

/**
 * Short handles → navigation id. These are the handles the server's context
 * enrichment has honoured (`@biostats`, `@510k`, …); keeping them means a
 * message that worked before the menu existed still works.
 */
const ALIASES: Readonly<Record<string, string>> = {
  'research': 'deep-research',
  'precedent': 'precedent-intelligence',
  'precedents': 'precedent-intelligence',
  '510k': 'device-510k',
  'pma': 'device-pma',
  'cer': 'device-cer',
  'pv': 'safety',
  'pharmacovigilance': 'safety',
  'biostats': 'biostat-workbench',
  'biostat': 'biostat-workbench',
  'stats': 'biostat-workbench',
  'protocol': 'biostatistics',
  'ectd': 'ectd-coauthor',
  'crl': 'crl-library',
  'module3': 'cmc',
};

function toApp(t: NavigationTarget): CallableApp {
  const aliases = Object.keys(ALIASES).filter((k) => ALIASES[k] === t.id);
  return { id: t.id, label: t.label, description: t.description, aliases, hint: t.id.replace(/-/g, ' ') };
}

/** The vocabulary, longest label first so a longer label always wins a prefix tie when parsing. */
export const CALLABLE_APPS: readonly CallableApp[] = NAVIGATION_TARGETS
  .filter((t) => t.group === 'module' || EXTRA_CALLABLE.has(t.id))
  .map(toApp)
  .sort((a, b) => b.label.length - a.label.length || a.label.localeCompare(b.label));

/** Every handle an app answers to, lower case: label, id, aliases. */
export function appHandles(app: CallableApp): string[] {
  return [app.label.toLowerCase(), app.id, ...app.aliases];
}

/**
 * Every (handle, app) pair, longest handle first, so that at an `@` the most
 * specific handle wins (`@biostatistics workbench` before `@biostatistics`,
 * `@biostatistics` before `@biostat`).
 */
const HANDLE_INDEX: ReadonlyArray<{ handle: string; app: CallableApp }> = CALLABLE_APPS
  .flatMap((app) => appHandles(app).map((handle) => ({ handle, app })))
  .sort((a, b) => b.handle.length - a.handle.length || a.handle.localeCompare(b.handle));

/** Case-insensitive lookup by label, id or alias. */
export function findCallableApp(handle: string): CallableApp | undefined {
  const needle = handle.trim().toLowerCase();
  return HANDLE_INDEX.find((h) => h.handle === needle)?.app;
}

/**
 * Apps a person is likely typing after `@`: any handle contains the query
 * (case-insensitive), prefix matches first, shortest labels next so the exact
 * match surfaces.
 */
export function searchCallableApps(query: string, limit = 8): CallableApp[] {
  const q = query.trim().toLowerCase();
  const qId = q.replace(/\s+/g, '-');
  const matches = (a: CallableApp) => appHandles(a).some((h) => h.includes(q) || h.includes(qId));
  const prefix = (a: CallableApp) => appHandles(a).some((h) => h.startsWith(q) || h.startsWith(qId));
  const pool = q ? CALLABLE_APPS.filter(matches) : [...CALLABLE_APPS];
  return pool
    .sort((a, b) => {
      const as = prefix(a) ? 0 : 1;
      const bs = prefix(b) ? 0 : 1;
      return as - bs || a.label.length - b.label.length || a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

export interface AppMention {
  app: CallableApp;
  /** Character offset of the `@` in the text. */
  index: number;
  /** Length of the whole token including the `@`. */
  length: number;
}

/**
 * Find every `@<handle>` in a message that names a callable app. Labels can
 * contain spaces and punctuation, so matching is by the vocabulary's handles
 * (longest first) at each `@`, not by a word regex. Unknown handles are not
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
    const hit = HANDLE_INDEX.find(({ handle }) => {
      if (!rest.startsWith(handle)) return false;
      const after = rest[handle.length];
      return after === undefined || !/[a-z0-9]/.test(after);
    });
    if (hit && !seen.has(hit.app.id)) {
      seen.add(hit.app.id);
      out.push({ app: hit.app, index: i, length: hit.handle.length + 1 });
    }
  }
  return out;
}

/**
 * The message with each recognised mention token removed and whitespace
 * collapsed — the request as the model should read it, once the invoked apps
 * have been named to it separately. Unknown `@text` is left alone.
 */
export function stripAppMentions(text: string): string {
  let out = text;
  for (const m of parseAppMentions(text).sort((a, b) => b.index - a.index)) {
    out = out.slice(0, m.index) + out.slice(m.index + m.length);
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '').trim();
}
