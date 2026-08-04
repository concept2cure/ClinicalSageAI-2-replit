/**
 * ui-v2 URL ↔ surface-id resolution. Deep links are the reason registry ids
 * must match the kit exactly — this pins the mapping, including the three
 * intentional SURFACE_VIEWS-only aliases.
 */
import { describe, expect, it } from 'vitest';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { surfaceIdFromLocation } from '../routing';

describe('surfaceIdFromLocation', () => {
  it('maps the bare base path to home', () => {
    expect(surfaceIdFromLocation('/concept2cure')).toBe('home');
    expect(surfaceIdFromLocation('/concept2cure/')).toBe('home');
  });

  it('maps every registry id to itself', () => {
    for (const s of UI_SURFACES) {
      expect(surfaceIdFromLocation(`/concept2cure/${s.id}`)).toBe(s.id);
    }
  });

  it('resolves deep-link aliases to their canonical surfaces', () => {
    expect(surfaceIdFromLocation('/concept2cure/task-board')).toBe('tasks');
    // `device-submission` used to alias to `document-authoring` while
    // SURFACE_VIEWS routed the same id to the device kit — the registry and the
    // deep-link table disagreeing about what one id means. It is a real surface
    // (the kit's submission-ops package view) and resolves to itself.
    expect(surfaceIdFromLocation('/concept2cure/device-submission')).toBe('device-submission');
    expect(surfaceIdFromLocation('/concept2cure/ind-lifecycle')).toBe('ind-checklist');
    for (const target of ['tasks', 'document-authoring', 'ind-checklist']) {
      expect(getSurface(target), target).toBeDefined();
    }
  });

  it('ignores trailing segments and query strings', () => {
    expect(surfaceIdFromLocation('/concept2cure/vault/some/deep/path')).toBe('vault');
    expect(surfaceIdFromLocation('/concept2cure/vault?ui-v2=1')).toBe('vault');
  });

  it('treats non-base locations as home', () => {
    expect(surfaceIdFromLocation('/somewhere-else')).toBe('home');
  });
});
