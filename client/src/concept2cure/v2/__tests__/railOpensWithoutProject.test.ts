// @vitest-environment jsdom
/**
 * The rail with no project open (2026-10-31: in a client demo every rail entry
 * but two "did nothing" — each project screen fell back to Projects without a
 * word). Tasks and Quality are organisation-wide and open on their own; a
 * project screen reopens the last project the signed-in account opened, and
 * never another account's.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { destinationFor } from '../routing';
import { publishShellProject, readShellProject, reopenLastProject } from '../shellProject';

const signIn = (id: string) => sessionStorage.setItem('trialsage_user', JSON.stringify({ id, email: `${id}@example.com` }));
const closeProject = () => {
  sessionStorage.removeItem('c2c.shell-project');
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = undefined;
};

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); closeProject(); });

describe('the rail with no project open', () => {
  it('opens Tasks and Quality without a project: both are organisation-wide', () => {
    expect(destinationFor('tasking', false).surfaceId).toBe('tasks');
    expect(destinationFor('quality', false).surfaceId).toBe('quality');
    expect(destinationFor('communication-center', false).surfaceId).toBe('projects');
  });

  /**
   * The two work areas the rail carries over a project's own data are project
   * screens, so neither opens on nothing.
   *
   * CMC is the precedent and has always been `scope: 'project'`
   * (shared/navigation/index.ts). Biostatistics was `scope: 'global'` when its
   * rail entry shipped on 2026-11-06, so it was the one rail door that opened a
   * work area with no project behind it — and the founder's words authorising
   * that entry end "But again, everything starts with a project"
   * (scripts/ci/one-product-baseline.json, `rail:biostatistics`). P-107 item 1
   * calls it "a work area over the project's data, not an app".
   *
   * With no project open the shell reopens the last project this account had
   * open (the case below); Projects is where it lands when there is none.
   */
  it('does not open a work area without a project: CMC and Biostatistics alike', () => {
    expect(destinationFor('cmc', false).surfaceId).toBe('projects');
    expect(destinationFor('biostatistics', false).surfaceId).toBe('projects');
  });

  it('opens both work areas when a project IS open', () => {
    expect(destinationFor('cmc', true).surfaceId).toBe('cmc');
    expect(destinationFor('biostatistics', true).surfaceId).toBe('biostatistics');
  });

  it('reopens the last project this account opened', () => {
    signIn('7');
    publishShellProject({ id: '65f7b785-9abe-4b9d-a5c7-3ddc477074e4', title: 'LMN-101 — IND (demo)' });
    closeProject();
    expect(readShellProject()).toBeNull();
    expect(reopenLastProject()).toBe(true);
    expect(readShellProject()).toMatchObject({ id: '65f7b785-9abe-4b9d-a5c7-3ddc477074e4', title: 'LMN-101 — IND (demo)' });
  });

  it("never reopens another account's project, and reopens nothing when nothing was opened", () => {
    signIn('7');
    publishShellProject({ id: '65f7b785-9abe-4b9d-a5c7-3ddc477074e4', title: 'LMN-101 — IND (demo)' });
    closeProject();
    signIn('8');
    expect(reopenLastProject()).toBe(false);
    expect(readShellProject()).toBeNull();
    localStorage.clear();
    signIn('7');
    expect(reopenLastProject()).toBe(false);
  });
});
