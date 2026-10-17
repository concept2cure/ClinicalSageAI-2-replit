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
  it('a fresh guard belongs to the current program', () => {
    const first = project.captureShellProjectGuard();
    project.publishShellProject({ id: B });
    const next = project.captureShellProjectGuard();
    expect(first()).toBe(false); expect(next()).toBe(true);
  });
});
