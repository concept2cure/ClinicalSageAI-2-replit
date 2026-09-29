// @vitest-environment jsdom
/**
 * Escape in the Demos menu closes the menu — and does not take the drive.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * While AnA drives, the drive strip (LiveDriveOverlay) listens for Escape on
 * window: Escape is "Take over". The Demos menu handled Escape only on its
 * own button, and its items are not inside that button. So Escape pressed on
 * a menu item — or anywhere, in a browser that does not focus a clicked
 * button, which is where focus is the moment the menu opens — left the menu
 * open and reached the strip, which took the wheel from AnA mid-drive. The
 * person asked to close a menu and ended a demonstration.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * With the real strip mounted and live: Escape while the menu is open, from
 * wherever focus is, closes the menu, returns focus to the Demos button, and
 * does not take over. Once the menu is closed, Escape takes over again — the
 * menu does not swallow the strip's key for good.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LiveDriveControlsContext, LiveDriveSwitch, type LiveDriveControlsValue } from '../LiveDriveSwitch';
import { LiveDriveOverlay } from '../LiveDriveOverlay';
import { INITIAL_DRIVE_STATE } from '../liveDrive';

afterEach(() => cleanup());

function controls(): LiveDriveControlsValue {
  return { on: true, locked: null, setOn: vi.fn(), onStartDemo: vi.fn(), onStartTour: vi.fn() };
}

/** The composer's switch beside a drive strip that is live — as on screen mid-drive. */
function mountDriving() {
  const onTakeOver = vi.fn();
  render(
    <>
      <LiveDriveOverlay state={{ ...INITIAL_DRIVE_STATE, active: true }} onTakeOver={onTakeOver} onStop={vi.fn()} />
      <LiveDriveControlsContext.Provider value={controls()}>
        <LiveDriveSwitch />
      </LiveDriveControlsContext.Provider>
    </>,
  );
  const demos = screen.getByRole('button', { name: 'Demos' });
  return { onTakeOver, demos };
}

const escape = (target: Element) => fireEvent.keyDown(target, { key: 'Escape', code: 'Escape' });

describe('Escape with the Demos menu open', () => {
  it('(the strip is live in this harness: Escape with no menu open takes over)', () => {
    const { onTakeOver } = mountDriving();
    escape(document.body);
    expect(onTakeOver).toHaveBeenCalledTimes(1);
  });

  it('pressed on a menu item: closes the menu, focus returns to Demos, the drive is not taken', () => {
    const { onTakeOver, demos } = mountDriving();
    fireEvent.click(demos);
    const item = screen.getByRole('menuitem', { name: 'Show me around' });
    item.focus();
    escape(item);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(demos);
    expect(onTakeOver).not.toHaveBeenCalled();
  });

  it('pressed with focus nowhere in the menu (a clicked button left unfocused): the same', () => {
    const { onTakeOver, demos } = mountDriving();
    fireEvent.click(demos);
    expect(screen.getByRole('menu')).toBeTruthy();
    // jsdom, like Safari, does not focus a button on click.
    expect(document.activeElement).toBe(document.body);
    escape(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(demos);
    expect(onTakeOver).not.toHaveBeenCalled();
  });

  it('pressed on the Demos button itself: the same', () => {
    const { onTakeOver, demos } = mountDriving();
    fireEvent.click(demos);
    demos.focus();
    escape(demos);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(demos);
    expect(onTakeOver).not.toHaveBeenCalled();
  });

  it('once the menu is closed, Escape is the strip’s again', () => {
    const { onTakeOver, demos } = mountDriving();
    fireEvent.click(demos);
    escape(document.body);
    expect(onTakeOver).not.toHaveBeenCalled();
    escape(document.body);
    expect(onTakeOver).toHaveBeenCalledTimes(1);
  });
});
