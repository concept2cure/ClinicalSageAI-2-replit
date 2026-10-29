/**
 * The device task workbench is folded into Tasks, and stays folded (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/).
 *
 * `device-tasks` was an organisation-wide copy of Tasks: TasksSurface in
 * mdx/workbench/Workbench.tsx over GET /api/submission-ops/workload. That route
 * answers with one row per owner, which the screen drew as "(Untitled)",
 * "Unassigned" task cards. Tasks (surfaces/TaskBoard.tsx, GET
 * /api/task-management/board) reads the same store item by item beside every
 * other store, and marks what another store records as blocking.
 *
 * This pins the fold from both ends:
 *   - the old id resolves to Tasks through the existing alias, from a URL, an
 *     in-app move or AnA's kept navigation target, with or without a project
 *     open: never a 404, never its own screen;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list
 *     it), no kit id, no client import of TasksSurface;
 *   - neither project scope list names it, the device rail does not, and the
 *     guided tour stops at Tasks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { MDX_SURFACE_IDS } from '../../mdx/surfaceIds';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_APPS } from '@shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { findNavigationTarget } from '@shared/navigation';
import { findDemoScript } from '@shared/navigation/demo-scripts';

const CLIENT = path.resolve(__dirname, '../../..');
const SELF = path.resolve(__filename);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && full !== SELF) {
      out.push(full);
    }
  }
  return out;
}

describe('device-tasks is folded into Tasks', () => {
  it('resolves the old id to Tasks from a link, an in-app move and AnA, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES['device-tasks']).toBe('tasks');
    expect(surfaceIdFromLocation(locationForSurface('device-tasks'))).toBe('tasks');
    expect(surfaceIdFromLocation('/concept2cure/device-tasks?view=board')).toBe('tasks');
    expect(destinationFor('device-tasks', true).surfaceId).toBe('tasks');
    expect(destinationFor('device-tasks', false).surfaceId).toBe('tasks');
    // AnA's handle is kept so an old conversation's move still lands.
    expect(findNavigationTarget('device-tasks')).toBeDefined();
  });

  it('lands on the Tasks board, which the shell can mount', () => {
    expect(SURFACE_VIEWS.tasks).toBeDefined();
    expect(getSurface('tasks')).toBeDefined();
    const views = fs.readFileSync(path.join(CLIENT, 'concept2cure/v2/surfaceViews.ts'), 'utf8');
    expect(views).toMatch(/const TaskBoard = lazySurface\(\(\) => import\('\.\/surfaces\/TaskBoard'\)/);
    expect(views).toMatch(/^\s*tasks: \{ component: TaskBoard \},$/m);
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no kit id', () => {
    expect(SURFACE_VIEWS['device-tasks']).toBeUndefined();
    expect(getSurface('device-tasks')).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === 'device-tasks')).toBe(false);
    expect(MDX_SURFACE_IDS as readonly string[]).not.toContain('device-tasks');
  });

  it('leaves no client code naming TasksSurface', () => {
    const naming = sourceFiles(CLIENT).filter((f) => /\bTasksSurface\b/.test(fs.readFileSync(f, 'utf8')));
    expect(naming.map((f) => path.relative(CLIENT, f))).toEqual([]);
  });

  it('is in neither project scope list nor the device rail, and the tour stops at Tasks', () => {
    expect(LAUNCH_APPS.find((a) => a.id === 'projects')!.surfaces).not.toContain('device-tasks');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('device-tasks');
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain('device-tasks');
    const targets = findDemoScript('training-medtech')!.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : []));
    expect(targets).not.toContain('device-tasks');
    expect(targets).toContain('tasking');
    expect(DEEP_LINK_ALIASES.tasking).toBe('tasks');
  });
});
