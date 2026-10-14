// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readTaskTarget, taskActorScope, taskTargetLocation } from '../taskTarget';
import { registerSurfaceLeaveGuard, surfaceLeaveRefusal } from '../navParams';

const scope = { userId: '42', organizationId: '7' };
describe('exact task target', () => {
  it('round-trips the complete business key without interpreting a title or a project', () => {
    const location = taskTargetLocation('TASK:a/b & review', scope)!;
    expect(readTaskTarget(location.slice(location.indexOf('?')), scope)).toEqual({ taskId: 'TASK:a/b & review' });
    expect(readTaskTarget('?program=17', scope)).toBeNull();
  });
  it.each(['?taskId=TASK-1', '?taskId=TASK-1&taskId=TASK-2&taskActor=42&taskOrg=7', '?taskId=%00&taskActor=42&taskOrg=7', '?taskId=&taskActor=42&taskOrg=7'])('refuses malformed target %s', search => {
    expect(readTaskTarget(search, scope)).toHaveProperty('error');
  });
  it('refuses an account or organization replacement', () => {
    const search = taskTargetLocation('TASK-1', scope)!.slice(6);
    expect(readTaskTarget(search, { ...scope, userId: '43' })).toHaveProperty('error');
    expect(readTaskTarget(search, { ...scope, organizationId: '8' })).toHaveProperty('error');
    expect(readTaskTarget(search, null)).toHaveProperty('error');
  });
  it.each([null, {}, { id: '0', organizationId: '7' }, { id: '1e2', organizationId: '7' }, { id: 42, organizationId: 'UUID' }, { id: '2147483648', organizationId: '7' }])('does not invent actor scope from %j', user => {
    expect(taskActorScope(user)).toBeNull();
  });
  it('accepts canonical numeric actor identities', () => {
    expect(taskActorScope({ id: 42, organizationId: 7 })).toEqual(scope);
    expect(taskTargetLocation(' TASK-1', scope)).toBeNull();
    expect(taskTargetLocation('T'.repeat(201), scope)).toBeNull();
    expect(taskTargetLocation(null as unknown as string, scope)).toBeNull();
    expect(taskTargetLocation(17 as unknown as string, scope)).toBeNull();
  });
});

describe('existing surface owns the navigation refusal', () => {
  it('preserves a native portalled ceremony while allowing the drawer itself', () => {
    const tray = document.createElement('aside'); tray.className = 'tt-panel'; tray.setAttribute('role', 'dialog'); document.body.append(tray);
    const ceremony = document.createElement('div'); ceremony.setAttribute('role', 'dialog'); document.body.append(ceremony);
    try {
      expect(surfaceLeaveRefusal()).toMatch(/dialog is open/);
      ceremony.remove();
      expect(surfaceLeaveRefusal()).toBeNull();
    } finally { tray.remove(); ceremony.remove(); }
  });
  it('refuses a busy surface until it releases ownership and unregisters on unmount', () => {
    let reason: string | null = 'A signature is in progress.';
    const remove = registerSurfaceLeaveGuard(() => reason);
    try {
      expect(surfaceLeaveRefusal()).toBe(reason);
      reason = null;
      expect(surfaceLeaveRefusal()).toBeNull();
      reason = 'Unsaved edits';
    } finally { remove(); }
    expect(surfaceLeaveRefusal()).toBeNull();
  });
  it('fails closed if the owning surface cannot determine its state', () => {
    const remove = registerSurfaceLeaveGuard(() => { throw new Error('not ready'); });
    try { expect(surfaceLeaveRefusal()).toMatch(/Finish or close/); }
    finally { remove(); }
  });
});
