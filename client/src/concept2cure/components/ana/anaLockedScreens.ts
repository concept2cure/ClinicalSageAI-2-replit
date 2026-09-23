/**
 * The navigation targets closed to this person, sent with every AnA turn as
 * `locked_screens` so her self-drive tools refuse them honestly (see
 * server/services/ana-ri/drive-context.ts).
 *
 * Written by the shell from the server's own per-request verdict set (launch
 * scope, plan tier, module grants — /api/module-subscriptions/navigation),
 * read by every chat instance at send time. A module-level store rather than a
 * prop because several chats send turns (the shell's, and each dock's), and
 * the list must reach all of them the same way.
 *
 * Only ever restricts what AnA attempts; never grants anything.
 */

import { findDemoScript, listDemoScripts } from '@shared/navigation/demo-scripts';
import { findSurfaceAction } from '@shared/navigation/surface-actions';

export interface LockedScreen {
  id: string;
  reason: string;
}

let current: LockedScreen[] = [];

export function setAnaLockedScreens(list: LockedScreen[]): void {
  current = list.slice(0, 200);
}

export function getAnaLockedScreens(): LockedScreen[] {
  return current;
}

/** The reason a navigation target is closed, or null when it is open. */
export function anaLockReason(targetId: string): string | null {
  const hit = current.find((l) => l.id === targetId);
  return hit ? hit.reason : null;
}

/**
 * The demonstrations every stop of which is open to this person. A demo that
 * walks onto a locked screen fails in front of the person it was run for, so
 * the menu does not offer it (the server refuses it the same way).
 */
export function availableDemoScripts(): ReturnType<typeof listDemoScripts> {
  return listDemoScripts().filter((d) => {
    const script = findDemoScript(d.id);
    if (!script) return false;
    return script.steps.every((step) => {
      if (step.navigate && anaLockReason(step.navigate.target)) return false;
      if (step.act) {
        const a = findSurfaceAction(step.act.actionId);
        if (a && anaLockReason(a.surfaceId)) return false;
      }
      return true;
    });
  });
}
