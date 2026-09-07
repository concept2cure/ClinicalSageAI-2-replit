/**
 * `@app` in a composer — the one hook and the one menu every composer uses.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * The constitution's §10.1 asks for `@app` invocation from the composer. The
 * `+` menu offered "Run a RIM tool" and "Slash commands & skills", both of
 * which SENT A MESSAGE asking AnA to describe her tools — there was no way to
 * name a capability inline. This module is that way, shared so the rail, the
 * thread and the front door behave identically.
 *
 * ── What it does and does not do ─────────────────────────────────────────────
 * Typing `@` (at the start of the draft or after whitespace) opens a menu of
 * the callable apps (shared/navigation/callable-apps — derived from the
 * navigation contract, so only screens AnA can reach are offered), filtered by
 * what is typed after the `@`. Choosing one inserts `@<label> ` into the
 * draft. That is all the client does: the SERVER parses the sent text against
 * the same vocabulary, so a mention typed without the menu means the same
 * thing, and nothing about "which app" is asserted by the client.
 *
 * Keyboard: ↑/↓ move, Enter/Tab choose, Escape closes. While the menu is open,
 * Enter chooses rather than sends — the composer's own Enter-to-send handler
 * runs only when `onKeyDown` returns false.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { searchCallableApps, type CallableApp } from '@shared/navigation/callable-apps';
import { I } from './icons';

/** The `@query` token that ends at the caret, or null when the caret is not in one. */
export function mentionTokenAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, Math.max(0, caret));
  const m = /(?:^|[\s(])@([^@\n]{0,40})$/.exec(before);
  if (!m) return null;
  const start = before.length - m[1].length - 1;
  return { start, query: m[1] };
}

/** `value` with the token at `start` replaced by the app's label (plus a trailing space); returns the new caret too. */
export function insertMention(value: string, start: number, caretEnd: number, app: CallableApp): { value: string; caret: number } {
  const inserted = `@${app.label} `;
  const next = value.slice(0, start) + inserted + value.slice(caretEnd);
  return { value: next, caret: start + inserted.length };
}

export interface AppMentionsApi {
  /** Whether the menu is showing. */
  open: boolean;
  items: CallableApp[];
  active: number;
  /** Call from the textarea's onKeyDown BEFORE the composer's own handling; true = consumed. */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Call from onChange / onSelect / onClick so the token under the caret is re-read. */
  sync: (el: HTMLTextAreaElement | null) => void;
  choose: (app: CallableApp) => void;
  close: () => void;
  setActive: (i: number) => void;
}

export function useAppMentions(
  value: string,
  setValue: (next: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
): AppMentionsApi {
  const [token, setToken] = useState<{ start: number; query: string; caret: number } | null>(null);
  const [active, setActive] = useState(0);

  const items = useMemo(() => (token ? searchCallableApps(token.query) : []), [token]);
  const open = token !== null && items.length > 0;

  const sync = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) { setToken(null); return; }
    const caret = el.selectionStart ?? el.value.length;
    const t = mentionTokenAt(el.value, caret);
    setToken((prev) => {
      if (!t) return null;
      if (prev && prev.start === t.start && prev.query === t.query && prev.caret === caret) return prev;
      return { ...t, caret };
    });
    if (!t) setActive(0);
  }, []);

  const close = useCallback(() => { setToken(null); setActive(0); }, []);

  const choose = useCallback((app: CallableApp) => {
    const el = textareaRef.current;
    const t = token ?? (el ? mentionTokenAt(el.value, el.selectionStart ?? el.value.length) : null);
    if (!t) return;
    const caretEnd = token?.caret ?? (el?.selectionStart ?? value.length);
    const next = insertMention(value, t.start, caretEnd, app);
    setValue(next.value);
    setToken(null);
    setActive(0);
    // Put the caret after the inserted mention once React has painted the new value.
    if (el) {
      requestAnimationFrame(() => {
        try { el.focus(); el.setSelectionRange(next.caret, next.caret); } catch { /* detached */ }
      });
    }
  }, [token, textareaRef, value, setValue]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(items[Math.min(active, items.length - 1)]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    return false;
  }, [open, items, active, choose, close]);

  return { open, items, active, onKeyDown, sync, choose, close, setActive };
}

/** The menu. Positioned by the host's composer (`position: relative`) through the `.ana-menu` rules. */
export function AppMentionMenu({ api, id }: { api: AppMentionsApi; id: string }) {
  if (!api.open) return null;
  return (
    <div className="ana-menu ana-mention" role="listbox" id={id} aria-label="Apps">
      <div className="ana-menu-sec">Apps — choose one to name it in your message</div>
      {api.items.map((app, i) => (
        <button
          key={app.id}
          type="button"
          role="option"
          aria-selected={i === api.active}
          className="ana-menu-item"
          data-on={i === api.active ? 'true' : undefined}
          onMouseEnter={() => api.setActive(i)}
          // mousedown, not click: a click would blur the textarea first and the
          // caret position the insertion needs would be gone.
          onMouseDown={(e) => { e.preventDefault(); api.choose(app); }}
          title={app.description}
        >
          <span className="ico">{I.grid}</span>
          <span>@{app.label}</span>
        </button>
      ))}
    </div>
  );
}
