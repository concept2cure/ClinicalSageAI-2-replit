// @vitest-environment jsdom
/**
 * The shell-project channel: window.C2C_PROJECT made reload-proof.
 *
 * The defect these pin against: the open program was a window global set in
 * four places and persisted nowhere, so a reload or a deep link straight to a
 * project-scoped surface (/concept2cure/cmc, /vault, /ectd-compile) landed
 * with no program and every surface fell to "Open a program".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  publishShellProject,
  restoreShellProject,
  syncShellProjectToUrl,
  useShellProjectInUrl,
} from '../shellProject';

const KEY = 'c2c.shell-project';
type ShellWindow = Window & { C2C_PROJECT?: { id?: unknown } };
const w = window as unknown as ShellWindow;

beforeEach(() => {
  delete w.C2C_PROJECT;
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  delete w.C2C_PROJECT;
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('publishShellProject', () => {
  it('sets the live global AND the per-tab mirror', () => {
    publishShellProject({ id: 'prog-uuid-1', title: 'BX-701 IND' });
    expect((w.C2C_PROJECT as { id?: string })?.id).toBe('prog-uuid-1');
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ id: 'prog-uuid-1', title: 'BX-701 IND' });
  });
});

describe('restoreShellProject', () => {
  it('rehydrates the global from the mirror after a reload', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ id: 'prog-uuid-2', title: 'BX-702' }));
    const restored = restoreShellProject();
    expect(restored?.id).toBe('prog-uuid-2');
    expect((w.C2C_PROJECT as { id?: string })?.id).toBe('prog-uuid-2');
  });

  it('never overwrites a live selection with the mirror', () => {
    w.C2C_PROJECT = { id: 'live-selection' };
    sessionStorage.setItem(KEY, JSON.stringify({ id: 'stale-mirror' }));
    const restored = restoreShellProject();
    expect(restored?.id).toBe('live-selection');
    expect((w.C2C_PROJECT as { id?: string })?.id).toBe('live-selection');
  });

  it('returns null with no mirror and publishes nothing', () => {
    expect(restoreShellProject()).toBeNull();
    expect(w.C2C_PROJECT).toBeUndefined();
  });

  it('treats a malformed or id-less mirror as no selection — never throws, never publishes garbage', () => {
    for (const raw of ['not json', '[]', '{}', '{"id":"  "}', '{"id":null}', '"a string"']) {
      sessionStorage.setItem(KEY, raw);
      expect(restoreShellProject(), `mirror ${JSON.stringify(raw)}`).toBeNull();
      expect(w.C2C_PROJECT, `global after ${JSON.stringify(raw)}`).toBeUndefined();
    }
  });
});

/* QA 2026-10-08 (j1, "Deep link or new tab to a project home shows 'No project
   selected'"): the open program lived only in this tab's sessionStorage and the
   window global, and the URL carried nothing, so a copied link, a bookmark or a
   new tab opened Project home with no project. The URL now names the open
   program (?program=<regulatory_programs UUID>), and a page load restores it. */
const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const OTHER = 'd979e567-4622-46f1-8cb7-8bf434227f25';

describe('the open program rides the URL', () => {
  it('a fresh tab on a link naming the program opens that program', () => {
    window.history.replaceState(null, '', `/concept2cure/project-home?program=${PROGRAM}`);
    const restored = restoreShellProject();
    expect(restored?.id).toBe(PROGRAM);
    expect((w.C2C_PROJECT as { id?: string })?.id).toBe(PROGRAM);
    // …and this tab's mirror now says so too, for the next reload.
    expect(JSON.parse(sessionStorage.getItem(KEY)!).id).toBe(PROGRAM);
  });

  it('the link wins over a mirror naming a different program', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ id: OTHER, title: 'HLV-333' }));
    window.history.replaceState(null, '', `/concept2cure/vault?program=${PROGRAM}`);
    expect(restoreShellProject()?.id).toBe(PROGRAM);
    // Nothing of the other program is carried over onto this one.
    expect((w.C2C_PROJECT as { title?: string })?.title).toBeUndefined();
  });

  it('keeps what the mirror knows when it names the same program', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ id: PROGRAM, title: 'BX-256', code: 'BX-256' }));
    window.history.replaceState(null, '', `/concept2cure/project-home?program=${PROGRAM.toUpperCase()}`);
    expect(restoreShellProject()).toMatchObject({ id: PROGRAM, title: 'BX-256', code: 'BX-256' });
  });

  it('ignores a program param that is not a program UUID', () => {
    for (const bad of ['7', 'proj_12', '7abb', '../vault', '<script>']) {
      delete w.C2C_PROJECT;
      sessionStorage.clear();
      window.history.replaceState(null, '', `/concept2cure/project-home?program=${encodeURIComponent(bad)}`);
      expect(restoreShellProject(), bad).toBeNull();
      expect(w.C2C_PROJECT, bad).toBeUndefined();
    }
  });

  it('writes the open program into the URL, keeping the path and every other param', () => {
    window.history.replaceState(null, '', '/concept2cure/vault?tab=coverage#sec');
    publishShellProject({ id: PROGRAM, title: 'BX-256' });
    syncShellProjectToUrl();
    expect(window.location.pathname).toBe('/concept2cure/vault');
    const q = new URLSearchParams(window.location.search);
    expect(q.get('program')).toBe(PROGRAM);
    expect(q.get('tab')).toBe('coverage');
    expect(window.location.hash).toBe('#sec');
  });

  it('drops the param when no program is open, or the open one is not a program', () => {
    window.history.replaceState(null, '', `/concept2cure/projects?program=${PROGRAM}`);
    syncShellProjectToUrl();
    expect(new URLSearchParams(window.location.search).get('program')).toBeNull();
    publishShellProject({ id: 42, title: 'legacy numeric workspace' });
    window.history.replaceState(null, '', `/concept2cure/projects?program=${PROGRAM}`);
    syncShellProjectToUrl();
    expect(new URLSearchParams(window.location.search).get('program')).toBeNull();
  });

  it('the shell hook follows both navigation and a newly opened program', () => {
    function Shell({ path }: { path: string }) {
      useShellProjectInUrl(path);
      return null;
    }
    window.history.replaceState(null, '', '/concept2cure/projects');
    const view = render(React.createElement(Shell, { path: '/concept2cure/projects' }));
    expect(window.location.search).toBe('');

    act(() => publishShellProject({ id: PROGRAM, title: 'BX-256' }));
    expect(new URLSearchParams(window.location.search).get('program')).toBe(PROGRAM);

    // Navigation pushes a bare surface URL; the hook puts the program back.
    window.history.pushState(null, '', '/concept2cure/project-home');
    view.rerender(React.createElement(Shell, { path: '/concept2cure/project-home' }));
    expect(window.location.pathname).toBe('/concept2cure/project-home');
    expect(new URLSearchParams(window.location.search).get('program')).toBe(PROGRAM);
  });
});
