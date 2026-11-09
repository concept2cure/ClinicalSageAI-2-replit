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
   * Biostatistics opens from the rail with no project open. CMC does not.
   *
   * This asymmetry is deliberate and was paid for. On 2026-11-09 I made the
   * biostatistics target `scope: 'project'` so a project-less visit could not
   * seed a pharma-oncology preset for a device organisation, and asserted here
   * that it lands on Projects. Driving the rail in a real browser showed what
   * that meant: a fresh session clicked Biostatistics and got the Projects
   * page. `reopenLastProject` only helps an account that has opened a project
   * before, which a demo has not. The founder found the screen missing.
   *
   * The founder's words authorising the entry are "the left rail should be a
   * navigation point for all of those entry points", and a navigation point
   * that opens Projects is not one. So it is global, and the preset defect is
   * fixed where it lives rather than by closing the door.
   *
   * CMC stays project-scoped: it has been since long before, nothing reported
   * it as missing, and widening it is its lane's call, not this one's.
   */
  it('Biostatistics opens from the rail with no project open', () => {
    expect(destinationFor('biostatistics', false).surfaceId).toBe('biostatistics');
  });

  it('CMC still asks for a project, as it always has', () => {
    expect(destinationFor('cmc', false).surfaceId).toBe('projects');
  });

  it('both open on themselves when a project IS open', () => {
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
