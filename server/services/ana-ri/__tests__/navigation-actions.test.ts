/**
 * Navigation directives → action chips.
 *
 * The properties under test are the ones that make this path safe to have at
 * all: a refusal upstream never becomes a jump downstream, and only a
 * `navigate_to` result can produce a navigation chip.
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_NAVIGATION_ACTIONS,
  directiveFromToolResult,
  surfaceActionFromToolResult,
  toNavigationActions,
  toSurfaceActionChips,
} from '../navigation-actions';
import { resolveNavigation, NAVIGATION_TARGETS } from '../../../../shared/navigation/index';
import { resolveSurfaceAction } from '../../../../shared/navigation/surface-actions';

/** A real target from the governed registry — not a fixture id. */
const REAL_TARGET = NAVIGATION_TARGETS.find(t => t.scope === 'global')!;

function navigateToResult(targetId: string): string {
  const res = resolveNavigation(targetId, {});
  if (!res.ok) throw new Error(`fixture target ${targetId} does not resolve`);
  return JSON.stringify({ status: 'navigation_ready', directive: res.directive });
}

describe('directiveFromToolResult', () => {
  it('reads the directive out of a successful navigate_to result', () => {
    const d = directiveFromToolResult('navigate_to', navigateToResult(REAL_TARGET.id));
    expect(d).not.toBeNull();
    expect(d!.targetId).toBe(REAL_TARGET.id);
    expect(d!.actionType).toBe('navigate');
  });

  it('returns null for a refused target — a refusal must not become a jump', () => {
    const refusal = JSON.stringify({
      status: 'unknown_target',
      message: 'no such screen',
      validTargets: ['home'],
    });
    expect(directiveFromToolResult('navigate_to', refusal)).toBeNull();
  });

  it('returns null when the tool asked for more parameters', () => {
    const needsParams = JSON.stringify({ status: 'needs_parameters', message: 'target is required' });
    expect(directiveFromToolResult('navigate_to', needsParams)).toBeNull();
  });

  it('returns null for any tool that is not navigate_to', () => {
    // The shape is valid; the provenance is not. Only the governed navigation
    // tool may move someone, so no other tool's output is read for a target.
    expect(directiveFromToolResult('search_precedents', navigateToResult(REAL_TARGET.id))).toBeNull();
  });

  it('returns null on unparseable or structurally wrong output', () => {
    expect(directiveFromToolResult('navigate_to', 'not json')).toBeNull();
    expect(directiveFromToolResult('navigate_to', 'null')).toBeNull();
    expect(
      directiveFromToolResult('navigate_to', JSON.stringify({ status: 'navigation_ready' })),
    ).toBeNull();
    expect(
      directiveFromToolResult(
        'navigate_to',
        JSON.stringify({ status: 'navigation_ready', directive: { actionType: 'navigate' } }),
      ),
    ).toBeNull();
  });
});

describe('toNavigationActions', () => {
  const directive = (targetId: string, params?: Record<string, string>) => ({
    actionType: 'navigate' as const,
    targetId,
    label: `Open ${targetId}`,
    path: `/${targetId}`,
    scope: 'global' as const,
    ...(params ? { params } : {}),
  });

  it('carries the target id, because the shell navigates by id', () => {
    const [a] = toNavigationActions([directive('cmc')]);
    expect(a).toMatchObject({ actionType: 'navigate', targetId: 'cmc', path: '/cmc', executed: true });
  });

  it('offers one chip when AnA resolves the same screen twice', () => {
    expect(toNavigationActions([directive('cmc'), directive('cmc')])).toHaveLength(1);
  });

  it('treats the same screen with different params as different destinations', () => {
    const out = toNavigationActions([
      directive('intelligence', { tab: 'precedent' }),
      directive('intelligence', { tab: 'risk' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('caps a turn — a response offering everything is offering nothing', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(id => directive(id));
    expect(toNavigationActions(many)).toHaveLength(MAX_NAVIGATION_ACTIONS);
  });

  it('omits params entirely when there are none, rather than sending an empty object', () => {
    expect(toNavigationActions([directive('cmc')])[0]).not.toHaveProperty('params');
  });
});

describe('surfaceActionFromToolResult', () => {
  const actionReady = () => {
    const res = resolveSurfaceAction('vault.search', { query: 'stability' });
    if (!res.ok) throw new Error('fixture action vault.search does not resolve');
    return JSON.stringify({ status: 'action_ready', directive: res.directive });
  };

  it('reads the directive out of a successful act_on_screen result', () => {
    const d = surfaceActionFromToolResult('act_on_screen', actionReady());
    expect(d).not.toBeNull();
    expect(d!.actionId).toBe('vault.search');
    expect(d!.surfaceId).toBe('vault');
    expect(d!.actionType).toBe('surface_action');
  });

  it('returns null for a refusal — governed_refused, unknown, or needs_parameters', () => {
    for (const status of ['governed_refused', 'unknown_action', 'needs_parameters']) {
      expect(
        surfaceActionFromToolResult('act_on_screen', JSON.stringify({ status, message: 'no' })),
      ).toBeNull();
    }
  });

  it('returns null for any tool that is not act_on_screen', () => {
    expect(surfaceActionFromToolResult('navigate_to', actionReady())).toBeNull();
  });

  it('returns null on unparseable or structurally wrong output', () => {
    expect(surfaceActionFromToolResult('act_on_screen', 'not json')).toBeNull();
    expect(
      surfaceActionFromToolResult('act_on_screen', JSON.stringify({ status: 'action_ready' })),
    ).toBeNull();
    expect(
      surfaceActionFromToolResult(
        'act_on_screen',
        JSON.stringify({ status: 'action_ready', directive: { actionType: 'navigate' } }),
      ),
    ).toBeNull();
  });
});

describe('toSurfaceActionChips', () => {
  const actionDirective = (actionId: string, params?: Record<string, string>) => ({
    actionType: 'surface_action' as const,
    actionId,
    surfaceId: actionId.split('.')[0],
    label: `Do ${actionId}`,
    ...(params ? { params } : {}),
  });

  it('carries the action id and surface, because the bus performs by id', () => {
    const [c] = toSurfaceActionChips([actionDirective('vault.search', { query: 'x' })]);
    expect(c).toMatchObject({
      actionType: 'surface_action',
      actionId: 'vault.search',
      surfaceId: 'vault',
      executed: true,
      params: { query: 'x' },
    });
  });

  it('dedups identical operations and caps like the navigation chips', () => {
    expect(
      toSurfaceActionChips([actionDirective('vault.search'), actionDirective('vault.search')]),
    ).toHaveLength(1);
    const many = ['a.x', 'b.x', 'c.x', 'd.x', 'e.x'].map(id => actionDirective(id));
    expect(toSurfaceActionChips(many)).toHaveLength(MAX_NAVIGATION_ACTIONS);
  });

  it('omits params entirely when there are none', () => {
    expect(toSurfaceActionChips([actionDirective('vault.search')])[0]).not.toHaveProperty('params');
  });
});
