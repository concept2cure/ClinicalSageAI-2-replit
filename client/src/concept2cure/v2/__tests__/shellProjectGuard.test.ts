// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import * as project from '../shellProject';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
beforeEach(() => project.publishShellProject({ id: A }));
describe('the existing shell project channel revision', () => {
  it('detects leaving and returning to the same program', () => {
    const current = project.captureShellProjectGuard();
    project.publishShellProject({ id: B }); project.publishShellProject({ id: A });
    expect(current()).toBe(false);
  });
  it('keeps same-program and metadata updates current', () => {
    const current = project.captureShellProjectGuard();
    project.publishShellProject({ id: A, title: 'Current title' });
    project.updateShellProject({ product: 'Recorded product' });
    expect(current()).toBe(true);
  });
  it('retires pending handoffs across a tenant clear and return to the same program', () => {
    const current = project.captureShellProjectGuard();
    project.clearShellProject();
    project.publishShellProject({ id: A });
    expect(current()).toBe(false);
  });
  it('a fresh guard belongs to the current program', () => {
    const first = project.captureShellProjectGuard();
    project.publishShellProject({ id: B });
    const next = project.captureShellProjectGuard();
    expect(first()).toBe(false); expect(next()).toBe(true);
  });
  it.each([[42, 43], ['PROGRAM-A', 'PROGRAM-B']])('retires a batched accepted-ident visit from %s to %s and back', (a, b) => {
    project.publishShellProject({ id: a });
    const current = project.captureShellProjectGuard();
    project.publishShellProject({ id: b });
    project.publishShellProject({ id: a });
    expect(current()).toBe(false);
  });
  it('keeps the same numeric identifier current across its string representation and metadata updates', () => {
    project.publishShellProject({ id: 42 });
    const current = project.captureShellProjectGuard();
    project.publishShellProject({ id: '42', title: 'Recorded project' });
    expect(current()).toBe(true);
  });
  it('keeps UUID case changes current without weakening the UUID-only routing helper', () => {
    const id = 'ABCDEFAB-1111-4111-8111-ABCDEFABCDEF';
    project.publishShellProject({ id });
    const current = project.captureShellProjectGuard();
    project.publishShellProject({ id: id.toLowerCase() });
    expect(current()).toBe(true);
    expect(project.shellProgramId({ id: 42 })).toBeNull();
    expect(project.shellProgramId({ id: 'PROGRAM-A' })).toBeNull();
  });
});
