// @vitest-environment jsdom
/**
 * The shell-project channel: window.C2C_PROJECT made reload-proof.
 *
 * The defect these pin against: the open program was a window global set in
 * four places and persisted nowhere, so a reload or a deep link straight to a
 * project-scoped surface (/concept2cure/cmc, /vault, /ectd-compile) landed
 * with no program and every surface fell to "Open a program".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publishShellProject, restoreShellProject } from '../shellProject';

const KEY = 'c2c.shell-project';
type ShellWindow = Window & { C2C_PROJECT?: { id?: unknown } };
const w = window as unknown as ShellWindow;

beforeEach(() => {
  delete w.C2C_PROJECT;
  sessionStorage.clear();
});
afterEach(() => {
  delete w.C2C_PROJECT;
  sessionStorage.clear();
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
