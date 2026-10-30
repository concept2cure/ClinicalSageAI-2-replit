// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { registerSurfaceLeaveGuard, surfaceLeaveRefusal } from '../navParams';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  document.body.replaceChildren();
});

function dialog(parent: HTMLElement = document.body): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'cmdk';
  element.setAttribute('role', 'dialog');
  parent.append(element);
  return element;
}

describe('navigation dialog exemption', () => {
  it('keeps strict defaults and exempts only the exact requesting dialog', () => {
    const palette = dialog();
    expect(surfaceLeaveRefusal()).toMatch(/dialog is open/);
    expect(surfaceLeaveRefusal(palette)).toBeNull();
    expect(surfaceLeaveRefusal(null)).toMatch(/dialog is open/);
  });

  it.each(['sibling', 'nested'])('still refuses a %s dialog with the same class', placement => {
    const palette = dialog();
    const other = dialog(placement === 'nested' ? palette : document.body);
    expect(surfaceLeaveRefusal(palette)).toMatch(/dialog is open/);
    other.remove();
    expect(surfaceLeaveRefusal(palette)).toBeNull();
  });

  it('still consults pending-work guards and fails closed if one throws', () => {
    const palette = dialog();
    const pending = registerSurfaceLeaveGuard(() => 'Save the pending section changes.');
    cleanups.push(pending);
    expect(surfaceLeaveRefusal(palette)).toBe('Save the pending section changes.');
    pending();
    cleanups.push(registerSurfaceLeaveGuard(() => { throw new Error('Unreadable editor state'); }));
    expect(surfaceLeaveRefusal(palette)).toBe('Finish or close the work on this screen before navigating.');
  });
});
