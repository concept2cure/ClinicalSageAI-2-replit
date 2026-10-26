// @vitest-environment jsdom
/**
 * `@app` in the composer — typing `@` offers the callable apps, choosing one
 * inserts its label, and every composer host is wired to the one hook.
 *
 * The hook is exercised through a minimal host so the assertions are about the
 * behaviour (token detection, insertion, keyboard) rather than about any one
 * surface's chrome; the wiring of the three real composers is pinned by
 * reading their source, the same way the shell contract tests do.
 */
import React, { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The rail's availability rule, as the menu reads it: a surface the release
   locks is a verdict of source 'launch-scope'. Default: nothing locked. */
const locked = vi.hoisted(() => new Set<string>());
vi.mock('../navEntitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navEntitlements')>()),
  useNavEntitlements: () => ({
    verdictFor: (id: string) => (locked.has(id) ? { surfaceId: id, entitled: false, source: 'launch-scope' } : null),
  }),
}));

import { AppMentionMenu, insertMention, mentionTokenAt, useAppMentions, type SkillMentionSource } from '../appMentions';
import { searchSlashCommands } from '@shared/ana/slash-commands';
import { findCallableApp, searchCallableApps } from '@shared/navigation/callable-apps';

function Host({ onSend, skills }: { onSend: (t: string) => void; skills?: SkillMentionSource }) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const m = useAppMentions(draft, setDraft, ref, skills);
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        aria-label="Message"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); m.sync(e.currentTarget); }}
        onKeyDown={(e) => { if (m.onKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(draft); } }}
      />
      <AppMentionMenu api={m} id="menu" />
    </div>
  );
}

const type = (el: HTMLTextAreaElement, value: string) => {
  fireEvent.change(el, { target: { value } });
  el.setSelectionRange(value.length, value.length);
  fireEvent.select(el);
};

afterEach(() => { cleanup(); locked.clear(); });

describe('mentionTokenAt / insertMention', () => {
  it('sees an app token only when the caret is inside an @word at the start or after whitespace', () => {
    expect(mentionTokenAt('@bio', 4)).toEqual({ kind: 'app', start: 0, query: 'bio' });
    expect(mentionTokenAt('size it with @Bios', 18)).toEqual({ kind: 'app', start: 13, query: 'Bios' });
    expect(mentionTokenAt('mail ana@concept', 16)).toBeNull();
    // Labels contain spaces ("Biostatistics workbench"), so the query may too;
    // a query no app matches simply offers nothing. A newline ends it.
    expect(mentionTokenAt('@bio done', 9)).toEqual({ kind: 'app', start: 0, query: 'bio done' });
    expect(mentionTokenAt('@bio\ndone', 9)).toBeNull();
    expect(mentionTokenAt('no at sign', 10)).toBeNull();
    // A completed mention (label + trailing space) is finished text — seen in
    // the browser: the caret landing after an insertion reopened the menu.
    const done = `@${findCallableApp('Labeling')!.label} `;
    expect(mentionTokenAt(done, done.length)).toBeNull();
    expect(mentionTokenAt(done + 'x', done.length + 1)).toEqual({ kind: 'app', start: 0, query: 'Labeling x' });
  });

  it('sees a command token only as the first word of the draft — where the server reads it', () => {
    expect(mentionTokenAt('/', 1)).toEqual({ kind: 'slash', start: 0, query: '' });
    expect(mentionTokenAt('/sa', 3)).toEqual({ kind: 'slash', start: 0, query: 'sa' });
    expect(mentionTokenAt('/sap now', 8)).toBeNull();
    expect(mentionTokenAt('run /sap', 8)).toBeNull();
    expect(mentionTokenAt(' /sap', 5)).toBeNull();
  });

  it('inserts the label with a trailing space and reports the caret after it', () => {
    const app = findCallableApp('Labeling')!;
    expect(insertMention('check @lab please', 6, 10, app)).toEqual({ value: 'check @Labeling  please', caret: 6 + '@Labeling '.length });
    const cmd = searchSlashCommands('sap')[0];
    expect(insertMention('/sa', 0, 3, { kind: 'slash', key: cmd.name, cmd })).toEqual({ value: '/sap ', caret: 5 });
  });
});

describe('useAppMentions in a composer', () => {
  it('typing @ opens the app list and Enter inserts the highlighted app instead of sending', () => {
    const sent: string[] = [];
    render(<Host onSend={(t) => sent.push(t)} />);
    const ta = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(ta, '@bio');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].textContent!.toLowerCase()).toContain('bio');
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(sent).toEqual([]); // consumed by the menu, not the composer
    const first = searchCallableApps('bio')[0];
    expect(ta.value).toBe(`@${first.label} `);
    expect(screen.queryByRole('listbox')).toBeNull();
    // The caret then lands after the inserted text (a select event, as in the
    // browser) — the menu must stay closed rather than reopen on the label.
    ta.setSelectionRange(ta.value.length, ta.value.length);
    fireEvent.select(ta);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('arrow keys move the highlight and Escape closes without inserting', () => {
    render(<Host onSend={() => {}} />);
    const ta = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(ta, '@');
    const before = screen.getAllByRole('option').length;
    expect(before).toBeGreaterThan(1);
    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(ta.value).toBe('@');
  });

  it('typing / at the start lists the commands the server parses and Enter inserts one', () => {
    const sent: string[] = [];
    render(<Host onSend={(t) => sent.push(t)} />);
    const ta = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(ta, '/pow');
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('aria-label')).toBe('Commands');
    expect(screen.getAllByRole('option')[0].textContent).toContain('/power');
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(sent).toEqual([]);
    expect(ta.value).toBe('/power ');
    // Once the command has its space, the menu is gone and Enter sends.
    type(ta, '/power ');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(sent).toEqual(['/power ']);
  });

  it('an unknown query offers nothing and Enter sends as usual', () => {
    const sent: string[] = [];
    render(<Host onSend={(t) => sent.push(t)} />);
    const ta = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(ta, '@zzzz');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(sent).toEqual(['@zzzz']);
  });
});

describe('the @ menu offers only what this viewer can open', () => {
  // 2026-10-25 (D2 client journey, slice 0): the menu listed every callable
  // feature, about forty of them outside the release, and choosing one ended
  // on "not in this release". It now asks the rail's rule (useSurfaceAvailable),
  // by the surface each navigation id opens (DEEP_LINK_ALIASES).
  it('a feature outside the release is not offered; one in it still is', () => {
    locked.add('deep-research');
    render(<Host onSend={vi.fn()} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(box, '@Deep');
    expect(screen.queryByRole('option', { name: /Deep Research/ })).toBeNull();
    type(box, '@Vault');
    expect(screen.getByRole('option', { name: /Vault/ })).toBeTruthy();
  });

  it('a navigation id is checked as the surface it opens', () => {
    // `tasking` (labelled Tasks) opens the `tasks` surface; locking `tasks` hides it.
    render(<Host onSend={vi.fn()} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(box, '@Tasking');
    expect(screen.getByRole('option', { name: '@Tasks' })).toBeTruthy();
    cleanup();
    locked.add('tasks');
    render(<Host onSend={vi.fn()} />);
    type(screen.getByLabelText('Message') as HTMLTextAreaElement, '@Tasking');
    expect(screen.queryByRole('option', { name: '@Tasks' })).toBeNull();
  });

  it('a locked feature does not take one of the eight places from an available one', () => {
    for (const app of searchCallableApps('', 100).slice(0, 8)) locked.add(app.id);
    render(<Host onSend={vi.fn()} />);
    type(screen.getByLabelText('Message') as HTMLTextAreaElement, '@');
    expect(screen.getAllByRole('option').length).toBe(8);
  });
});

describe('every composer host is wired to the one hook', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  // Shell.tsx held the right rail's composer; the rail is deleted
  // (docs/evidence/D2-ONE-ANA/2026-10-08/ana-2a-rail-code-and-nav). The
  // conversation's composer is ConversationThread.tsx's, listed here.
  for (const f of ['surfaces/ConversationThread.tsx', 'surfaces/Surfaces.tsx']) {
    it(`${f} uses useAppMentions and renders AppMentionMenu on its textarea`, () => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // The fourth argument, when a host passes one, is its skill source (§10, skills in `/`).
      expect(src).toMatch(/useAppMentions\(draft, setDraft, draftRef(, \w+)?\)/);
      expect(src).toMatch(/<AppMentionMenu api=\{mentions\}/);
      expect(src).toMatch(/if \(mentions\.onKeyDown\(e\)\) return;/);
    });
  }
});

describe('skills in the `/` menu', () => {
  const STABILITY = { key: 'cmc.stability', name: 'Stability programs and shelf life', description: 'Designing stability studies.' };
  const source = (pick: (key: string) => void): SkillMentionSource => ({
    search: (q) => ([STABILITY].filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))),
    pick,
  });

  it('lists matching skills after the commands, and choosing one picks it and inserts no text', () => {
    const pick = vi.fn();
    render(<Host onSend={() => {}} skills={source(pick)} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(box, '/stab');
    const option = screen.getByRole('option', { name: /Stability programs and shelf life/ });
    expect(screen.getByText('Commands start your message; a skill is used on every turn of this conversation')).toBeTruthy();
    fireEvent.mouseDown(option);
    expect(pick).toHaveBeenCalledWith('cmc.stability');
    expect(box.value).toBe('');
  });

  it('chooses a skill from the keyboard like a command, and Enter does not send', () => {
    const pick = vi.fn();
    const onSend = vi.fn();
    render(<Host onSend={onSend} skills={source(pick)} />);
    const box = screen.getByLabelText('Message') as HTMLTextAreaElement;
    type(box, '/stability');
    const options = screen.getAllByRole('option');
    const index = options.findIndex((o) => /Stability programs/.test(o.textContent ?? ''));
    for (let i = 0; i < index; i++) fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(pick).toHaveBeenCalledWith('cmc.stability');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('offers no skill in a composer that passes no source, and commands are unchanged', () => {
    render(<Host onSend={() => {}} />);
    type(screen.getByLabelText('Message') as HTMLTextAreaElement, '/stab');
    expect(screen.queryByRole('option', { name: /Stability programs/ })).toBeNull();
  });
});
