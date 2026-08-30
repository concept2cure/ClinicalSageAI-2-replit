/**
 * Surface-action contract tests — the properties that make "AnA operates the
 * screen" safe to have at all:
 *
 *   1. TOTALITY — every registered action operates a screen that exists in
 *      the navigation registry, so an action can never point at nothing.
 *   2. GOVERNANCE — no registered action id names governed work, and the
 *      refusal is enforced at registration AND at resolution. This is the
 *      structural half of "Live Drive never approves"; shown FAILING first on
 *      a deliberately governed id, per the working agreement.
 *   3. FAIL-CLOSED RESOLUTION — unknown ids, missing required params, and
 *      out-of-enum values refuse with a typed error, never a best-effort
 *      directive.
 */
import { describe, expect, it } from 'vitest';

import { findNavigationTarget } from '../index';
import {
  GOVERNED_VERB_PATTERN,
  SURFACE_ACTIONS,
  assertUngovernedActionId,
  findSurfaceAction,
  resolveSurfaceAction,
  surfaceActionIds,
  surfaceActionsForSurface,
} from '../surface-actions';

describe('registry totality', () => {
  it('every action operates a screen the navigation registry knows', () => {
    for (const a of SURFACE_ACTIONS) {
      expect(findNavigationTarget(a.surfaceId), `${a.id} → surface "${a.surfaceId}"`).toBeDefined();
    }
  });

  it('every action id is namespaced to its surface and unique', () => {
    const seen = new Set<string>();
    for (const a of SURFACE_ACTIONS) {
      expect(a.id.startsWith(`${a.surfaceId}.`), `${a.id} must start with "${a.surfaceId}."`).toBe(
        true,
      );
      expect(seen.has(a.id), `duplicate action id ${a.id}`).toBe(false);
      seen.add(a.id);
    }
  });

  it('every enum param has non-empty values and required params have descriptions', () => {
    for (const a of SURFACE_ACTIONS) {
      for (const p of a.params ?? []) {
        expect(p.description.length, `${a.id}.${p.name} description`).toBeGreaterThan(0);
        if (p.enum) expect(p.enum.length, `${a.id}.${p.name} enum`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the governance boundary', () => {
  it('no registered action names governed work', () => {
    for (const a of SURFACE_ACTIONS) {
      expect(() => assertUngovernedActionId(a.id)).not.toThrow();
    }
  });

  it('REFUSES a governed id — the check shown failing on what it exists to catch', () => {
    // These are exactly the ids someone would plausibly try to register next.
    for (const bad of [
      'review.approve-document',
      'review.sign-section',
      'submission-gateway.submit-package',
      'vault.delete-document',
      'authoring.lock-section',
      // Part 11 e-signed sequence lifecycle writes — flagged in wave-2 recon
      // as a regex gap (freeze/dispatch were not refused); they are now.
      'submissions.freeze-sequence',
      'submissions.dispatch-sequence',
      // Residual-risk acceptance is a persisted governed judgment (ISO 14971
      // risk file PATCH) — flagged in wave-3 recon as the next regex gap.
      'risk.accept-residual',
      // Advancing a change is the quality module's Part 11 ceremony (reason +
      // e-signature + independent approver); launching deep research is a
      // metered credit spend. Both flagged by wave-4 recon as exactly the ids
      // someone would try next — and as regex gaps until 'advance'/'launch'
      // joined the pattern.
      'quality.advance-change',
      'quality.approve-document',
      'deep-research.launch-research',
      // Wave 6 put AnA's hands on the admin and licensing consoles — the ids
      // someone would try next are a module grant and the two spellings of a
      // payment start. Regex gaps until grant/checkout/purchase joined.
      'master-licensing.grant-module',
      'licensing.open-checkout',
      'licensing.purchase-plan',
    ]) {
      expect(GOVERNED_VERB_PATTERN.test(bad), bad).toBe(true);
      expect(() => assertUngovernedActionId(bad)).toThrow(/governed/);
    }
  });

  it('ungoverned view verbs pass the pattern (no false positives on the registry style)', () => {
    for (const good of ['vault.search', 'projects.open-program', 'tasking.filter-status']) {
      expect(GOVERNED_VERB_PATTERN.test(good), good).toBe(false);
    }
  });

  it('deep-research actions carry no credit-spend pre-arm params', () => {
    // The surface's primary button POSTs the query/sources/depth as-is to the
    // metered jobs endpoint — a directive that fills any of them arms a spend
    // one click away (that incident is documented in the surface itself, from
    // when a fixture value did it). The tab param is the whole surface.
    const dr = SURFACE_ACTIONS.filter((a) => a.surfaceId === 'deep-research');
    expect(dr.length).toBeGreaterThan(0);
    const forbidden = ['query', 'indication', 'question', 'depth', 'connector', 'connectors', 'source', 'sources', 'sel'];
    for (const a of dr) {
      for (const p of a.params ?? []) {
        expect(forbidden.includes(p.name), `${a.id}.${p.name} pre-arms a metered spend`).toBe(false);
      }
    }
  });
});

describe('resolveSurfaceAction — fail closed', () => {
  it('unknown action → typed refusal listing the valid ids', () => {
    const res = resolveSurfaceAction('vault.teleport');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('unknown_action');
      expect(res.validActions).toEqual(surfaceActionIds());
    }
  });

  it('missing required param → refusal naming the param', () => {
    const res = resolveSurfaceAction('vault.search', {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('missing_param');
      expect(res.error).toContain('query');
    }
  });

  it('out-of-enum param → refusal naming the legal values', () => {
    const res = resolveSurfaceAction('projects.set-view', { view: 'carousel' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('invalid_param');
      expect(res.error).toContain('grid');
    }
  });

  it('a sound request → the registry directive, params stringified and filtered', () => {
    const res = resolveSurfaceAction('projects.filter', { workstream: 'MDX', junk: 'x' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.directive).toEqual({
        actionType: 'surface_action',
        actionId: 'projects.filter',
        surfaceId: 'projects',
        label: 'Filter the portfolio',
        params: { workstream: 'MDX' },
      });
    }
  });

  it('discovery filters by surface', () => {
    const vaultActions = surfaceActionsForSurface('vault').map((a) => a.id);
    expect(vaultActions).toContain('vault.search');
    expect(vaultActions).toContain('vault.open-folder');
    expect(vaultActions.every((id) => id.startsWith('vault.'))).toBe(true);
    expect(findSurfaceAction('projects.open-program')?.surfaceId).toBe('projects');
  });
});
