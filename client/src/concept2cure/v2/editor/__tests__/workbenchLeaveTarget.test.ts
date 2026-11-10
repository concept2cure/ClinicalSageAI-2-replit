import { describe, expect, it, vi } from 'vitest';
import { admitWorkbenchNavigation, workbenchNavigationRefusal, type WorkbenchLeaveTarget } from '../workbenchLeaveTarget';

describe('held exact-filing navigation rechecks current scope before applying', () => {
  it('allows the original scope and refuses the same target after it retires', () => {
    let current = true;
    const target: WorkbenchLeaveTarget = { kind: 'document', id: 'saved-copy', current: () => current };
    const blocked = vi.fn(); const admit = vi.fn(() => true);
    expect(admitWorkbenchNavigation(target, false, blocked, admit)).toBe(true);
    current = false;
    expect(admitWorkbenchNavigation(target, false, blocked, admit)).toBe(false);
    expect(blocked).toHaveBeenCalledOnce(); expect(admit).not.toHaveBeenCalled();
    expect(workbenchNavigationRefusal(target)).toMatch(/linked filing is no longer current/);
  });
  it('refuses an otherwise current target during a held project switch', () => {
    expect(admitWorkbenchNavigation({ kind: 'document', id: 'saved-copy', current: () => true }, true, vi.fn(), vi.fn())).toBe(false);
  });
  it('preserves legacy document navigation and existing source admission', () => {
    expect(admitWorkbenchNavigation({ kind: 'document', id: 'saved-copy' }, false, vi.fn(), vi.fn())).toBe(true);
    const intent = { current: () => true } as never;
    const admit = vi.fn(() => false);
    expect(admitWorkbenchNavigation({ kind: 'document', id: 'saved-copy', assemblyIntent: intent }, false, vi.fn(), admit)).toBe(false);
    expect(admit).toHaveBeenCalledWith(intent, true);
  });
});
