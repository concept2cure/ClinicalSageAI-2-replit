/**
 * `@app` and `/command` in a composer — the one hook and the one menu every
 * composer uses.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * The constitution's §10.1 asks for `@app` invocation and slash commands from
 * the composer. The `+` menu offered "Run a RIM tool" and "Slash commands &
 * skills", both of which SENT A MESSAGE asking AnA to describe her tools —
 * there was no way to name a capability or a command inline. This module is
 * that way, shared so the rail, the thread and the front door behave
 * identically.
 *
 * ── What it does and does not do ─────────────────────────────────────────────
 * Typing `@` (at the start of the draft or after whitespace) opens a menu of
 * the callable apps (shared/navigation/callable-apps — derived from the
 * navigation contract, so only screens AnA can reach are offered), filtered by
 * what is typed after the `@`. Choosing one inserts `@<label> ` into the
 * draft.
 *
 * Typing `/` as the FIRST character of the draft opens a menu of the slash
 * commands (shared/ana/slash-commands — the list the server parses, and only
 * that list), filtered by what follows. Choosing one inserts `/<name> `. The
 * server recognises a command only at the start of a message, so the menu
 * offers commands only there.
 *
 * That is all the client does: the SERVER parses the sent text against the
 * same two vocabularies, so a mention or command typed without the menu means
 * the same thing, and nothing about "which app" is asserted by the client.
 *
 * Skills (2026-10-22, docs/design/ANA_SKILLS_2026-10-22.md §10). A composer
 * that holds a conversation's picked skills passes a skill source; the `/`
 * menu then lists, after the commands, the skills that match what is typed.
 * Choosing a skill inserts NO text: the typed `/query` is removed and the skill
 * joins the conversation's picks, which ride on every turn as `skills`. So the
 * menu still never puts a command in the message that the server does not
 * parse, and a skill is used the same way whether it is picked here or in the
 * composer's Skills menu.
 *
 * Keyboard: ↑/↓ move, Enter/Tab choose, Escape closes. While the menu is open,
 * Enter chooses rather than sends — the composer's own Enter-to-send handler
 * runs only when `onKeyDown` returns false.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { CALLABLE_APPS, findCallableApp, searchCallableApps, type CallableApp } from '@shared/navigation/callable-apps';
import { useSurfaceAvailable } from './surfaceAvailable';
import { DEEP_LINK_ALIASES } from './registryModel';
import { searchSlashCommands, type SlashCommand } from '@shared/ana/slash-commands';
import { I } from './icons';

export type MentionKind = 'app' | 'slash';

/** A skill as the `/` menu offers it. */
export interface MentionSkill {
  key: string;
  name: string;
  description: string;
}

/**
 * Where a composer's `/` menu finds skills, and what choosing one does. `search`
 * answers from what is already read (an empty list while it loads); `pick` adds
 * the skill to the conversation.
 */
export interface SkillMentionSource {
  search: (query: string) => MentionSkill[];
  pick: (key: string) => void;
}

export interface MentionToken {
  kind: MentionKind;
  /** Offset of the `@` or `/` in the value. */
  start: number;
  query: string;
}

export type MentionItem =
  | { kind: 'app'; key: string; app: CallableApp }
  | { kind: 'slash'; key: string; cmd: SlashCommand }
  | { kind: 'skill'; key: string; skill: MentionSkill };

/** The `@query` or leading `/query` token that ends at the caret, or null when the caret is not in one. */
export function mentionTokenAt(value: string, caret: number): MentionToken | null {
  const before = value.slice(0, Math.max(0, caret));
  const at = /(?:^|[\s(])@([^@\n]{0,40})$/.exec(before);
  if (at) {
    // `@<label> ` — a completed mention with its trailing space — is finished
    // text, not a query. Without this the caret landing after an insertion
    // re-reads the label and reopens the menu on its own exact match.
    if (/\s$/.test(at[1]) && findCallableApp(at[1])) return null;
    return { kind: 'app', start: before.length - at[1].length - 1, query: at[1] };
  }
  // A command only counts at the very start of the draft — where the server reads it.
  const slash = /^\/([a-z0-9-]{0,24})$/i.exec(before);
  if (slash) return { kind: 'slash', start: 0, query: slash[1] };
  return null;
}

/** The text a chosen item inserts, with its trailing space. A skill inserts none. */
export function insertionFor(item: MentionItem): string {
  if (item.kind === 'skill') return '';
  return item.kind === 'app' ? `@${item.app.label} ` : `/${item.cmd.name} `;
}

/** `value` with the token at `start` replaced by the item's text; returns the new caret too. */
export function insertMention(value: string, start: number, caretEnd: number, item: MentionItem | CallableApp): { value: string; caret: number } {
  const inserted = insertionFor('kind' in item ? item : { kind: 'app', key: item.id, app: item });
  const next = value.slice(0, start) + inserted + value.slice(caretEnd);
  return { value: next, caret: start + inserted.length };
}

/** How many skills the `/` menu lists after the commands. */
const SKILLS_LISTED = 6;
/** How many features the `@` menu lists. */
const APPS_LISTED = 8;

/**
 * The features the `@` menu offers: those this viewer can open, by the rail's
 * rule (useSurfaceAvailable), asked of the surface each navigation id opens
 * (DEEP_LINK_ALIASES: `tasking` opens `tasks`). Until 2026-10-25 it offered
 * every callable feature, about forty outside the release, and choosing one
 * ended on "not in this release" (D2 client journey, slice 0). Filtered before
 * the eight are taken, so a locked feature never holds an available one's place.
 */
function itemsFor(token: MentionToken, skills: SkillMentionSource | undefined, available: (surfaceId: string) => boolean): MentionItem[] {
  if (token.kind === 'slash') {
    const commands: MentionItem[] = searchSlashCommands(token.query).map((cmd) => ({ kind: 'slash', key: cmd.name, cmd }));
    const found: MentionItem[] = (skills?.search(token.query) ?? [])
      .slice(0, SKILLS_LISTED)
      .map((skill) => ({ kind: 'skill', key: `skill:${skill.key}`, skill }));
    return [...commands, ...found];
  }
  return searchCallableApps(token.query, CALLABLE_APPS.length)
    .filter((app) => available(DEEP_LINK_ALIASES[app.id] ?? app.id))
    .slice(0, APPS_LISTED)
    .map((app) => ({ kind: 'app', key: app.id, app }));
}

export interface AppMentionsApi {
  /** Whether the menu is showing. */
  open: boolean;
  /** What the open menu lists. */
  kind: MentionKind | null;
  items: MentionItem[];
  active: number;
  /** Call from the textarea's onKeyDown BEFORE the composer's own handling; true = consumed. */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Call from onChange / onSelect / onClick so the token under the caret is re-read. */
  sync: (el: HTMLTextAreaElement | null) => void;
  choose: (item: MentionItem) => void;
  close: () => void;
  setActive: (i: number) => void;
}

export function useAppMentions(
  value: string,
  setValue: (next: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  skills?: SkillMentionSource,
): AppMentionsApi {
  const [token, setToken] = useState<(MentionToken & { caret: number }) | null>(null);
  const [active, setActive] = useState(0);

  const available = useSurfaceAvailable();
  const items = useMemo(() => (token ? itemsFor(token, skills, available) : []), [token, skills, available]);
  const open = token !== null && items.length > 0;

  const sync = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) { setToken(null); return; }
    const caret = el.selectionStart ?? el.value.length;
    const t = mentionTokenAt(el.value, caret);
    setToken((prev) => {
      if (!t) return null;
      if (prev && prev.kind === t.kind && prev.start === t.start && prev.query === t.query && prev.caret === caret) return prev;
      return { ...t, caret };
    });
    if (!t) setActive(0);
  }, []);

  const close = useCallback(() => { setToken(null); setActive(0); }, []);

  const choose = useCallback((item: MentionItem) => {
    const el = textareaRef.current;
    const t = token ?? (el ? mentionTokenAt(el.value, el.selectionStart ?? el.value.length) : null);
    if (!t) return;
    const caretEnd = token?.caret ?? (el?.selectionStart ?? value.length);
    // A skill joins the conversation; the `/query` that found it leaves the draft.
    if (item.kind === 'skill') skills?.pick(item.skill.key);
    const next = insertMention(value, t.start, caretEnd, item);
    setValue(next.value);
    setToken(null);
    setActive(0);
    // Put the caret after the inserted text once React has painted the new value.
    if (el) {
      requestAnimationFrame(() => {
        try { el.focus(); el.setSelectionRange(next.caret, next.caret); } catch { /* detached */ }
      });
    }
  }, [token, textareaRef, value, setValue, skills]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(items[Math.min(active, items.length - 1)]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    return false;
  }, [open, items, active, choose, close]);

  return { open, kind: token?.kind ?? null, items, active, onKeyDown, sync, choose, close, setActive };
}

function itemIcon(item: MentionItem): React.ReactNode {
  if (item.kind === 'app') return I.grid;
  return item.kind === 'skill' ? I.bookOpen : I.terminal;
}

function itemLabel(item: MentionItem): string {
  if (item.kind === 'app') return `@${item.app.label}`;
  return item.kind === 'skill' ? item.skill.name : `/${item.cmd.name}`;
}

function itemSummary(item: MentionItem): string {
  if (item.kind === 'app') return item.app.description;
  return item.kind === 'skill' ? item.skill.description : item.cmd.summary;
}

function menuHeading(kind: MentionKind | null, items: MentionItem[]): string {
  if (kind !== 'slash') return 'Features — choose one to name it in your message';
  return items.some((i) => i.kind === 'skill')
    ? 'Commands start your message; a skill is used on every turn of this conversation'
    : 'Commands — choose one to start your message with';
}

/** The menu. Positioned by the host's composer (`position: relative`) through the `.ana-menu` rules. */
export function AppMentionMenu({ api, id }: { api: AppMentionsApi; id: string }) {
  if (!api.open) return null;
  const slash = api.kind === 'slash';
  return (
    <div className="ana-menu ana-mention" role="listbox" id={id} aria-label={slash ? 'Commands' : 'Features'}>
      <div className="ana-menu-sec">{menuHeading(api.kind, api.items)}</div>
      {api.items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={i === api.active}
          className="ana-menu-item"
          data-on={i === api.active ? 'true' : undefined}
          onMouseEnter={() => api.setActive(i)}
          // mousedown, not click: a click would blur the textarea first and the
          // caret position the insertion needs would be gone.
          onMouseDown={(e) => { e.preventDefault(); api.choose(item); }}
          title={itemSummary(item)}
        >
          <span className="ico">{itemIcon(item)}</span>
          <span>{itemLabel(item)}</span>
          {item.kind !== 'app' && <span className="ana-mention-sub">{item.kind === 'skill' ? 'Skill' : item.cmd.summary}</span>}
        </button>
      ))}
    </div>
  );
}
