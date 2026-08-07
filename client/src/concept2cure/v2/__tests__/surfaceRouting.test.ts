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

describe('the retired kit paths still land somewhere real', () => {
  // `/concept2cure/mdx` and `/concept2cure/pdev` were top-level routes when the
  // kits were separate applications. Links and bookmarks still point at them.
  //
  // The first attempt redirected to `/concept2cure?surface=device-workstream`,
  // with a comment saying "so existing links still land". Nothing reads
  // `?surface=` — and wouter hands this function `location.pathname`, which has
  // no query string at all — so both landed on home. A redirect that silently
  // goes to the wrong place is worse than no redirect, because it looks handled.
  it('/concept2cure/mdx resolves to the kit entry surface', () => {
    expect(surfaceIdFromLocation('/concept2cure/mdx')).toBe('device-workstream');
  });

  it('/concept2cure/pdev resolves to itself — it is a real surface id now', () => {
    expect(surfaceIdFromLocation('/concept2cure/pdev')).toBe('pdev');
  });

  it('neither falls through to home', () => {
    // The exact failure being guarded. If an alias is dropped or the shell stops
    // owning these paths, this is what breaks first.
    expect(surfaceIdFromLocation('/concept2cure/mdx')).not.toBe('home');
    expect(surfaceIdFromLocation('/concept2cure/pdev')).not.toBe('home');
  });
});

