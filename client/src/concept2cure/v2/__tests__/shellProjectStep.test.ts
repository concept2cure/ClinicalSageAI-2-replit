// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearShellProject, publishShellProject, readShellProject, restoreShellProject, updateShellProject } from '../shellProject';

const A = '5b2d7c11-2222-4333-8444-555566667777';
const B = '6b2d7c11-2222-4333-8444-555566667777';
const KEY = 'c2c.shell-project';
beforeEach(() => { clearShellProject(); sessionStorage.clear(); window.history.replaceState(null, '', '/'); });
afterEach(() => { clearShellProject(); sessionStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('the open step belongs to this project visit', () => {
  it('keeps a selected step through same-project card republishing', () => {
    publishShellProject({ id: A, title: 'A' });
    updateShellProject({ step: 'review' });
    publishShellProject({ id: A.toUpperCase(), title: 'A renamed' });
    expect(readShellProject()?.step).toBe('review');
    expect(JSON.parse(sessionStorage.getItem(KEY)!).step).toBe('review');
  });

  it('drops the prior project step on A → B → A', () => {
    publishShellProject({ id: A, step: 'submit' });
    publishShellProject({ id: B });
    expect(readShellProject()?.step).toBeUndefined();
    publishShellProject({ id: A });
    expect(readShellProject()?.step).toBeUndefined();
  });

  it('clear retires the step and its mirror', () => {
    publishShellProject({ id: A, step: 'plan' });
    clearShellProject();
    expect(readShellProject()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('restores a valid step only for the URL’s same project', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ id: A, step: 'evidence' }));
    window.history.replaceState(null, '', `/?program=${A}`);
    expect(restoreShellProject()?.step).toBe('evidence');
    clearShellProject();
    sessionStorage.setItem(KEY, JSON.stringify({ id: A, step: 'evidence' }));
    window.history.replaceState(null, '', `/?program=${B}`);
    expect(restoreShellProject()?.step).toBeUndefined();
  });

  it.each(['lifecycle', 'not-a-step', 3, {}, null])('discards invalid mirrored step %j', step => {
    sessionStorage.setItem(KEY, JSON.stringify({ id: A, step }));
    expect(restoreShellProject()?.step).toBeUndefined();
    expect(readShellProject()?.id).toBe(A);
  });
});
