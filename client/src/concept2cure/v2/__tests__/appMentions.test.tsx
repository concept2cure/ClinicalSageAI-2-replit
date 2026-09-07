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
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppMentionMenu, insertMention, mentionTokenAt, useAppMentions } from '../appMentions';
import { searchSlashCommands } from '@shared/ana/slash-commands';
import { findCallableApp, searchCallableApps } from '@shared/navigation/callable-apps';

function Host({ onSend }: { onSend: (t: string) => void }) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const m = useAppMentions(draft, setDraft, ref);
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

afterEach(() => cleanup());

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

describe('every composer host is wired to the one hook', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const f of ['Shell.tsx', 'surfaces/ConversationThread.tsx', 'surfaces/Surfaces.tsx']) {
    it(`${f} uses useAppMentions and renders AppMentionMenu on its textarea`, () => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).toMatch(/useAppMentions\(draft, setDraft, draftRef\)/);
      expect(src).toMatch(/<AppMentionMenu api=\{mentions\}/);
      expect(src).toMatch(/if \(mentions\.onKeyDown\(e\)\) return;/);
    });
  }
});
