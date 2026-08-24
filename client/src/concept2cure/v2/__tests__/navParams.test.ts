// @vitest-environment jsdom
/**
 * The navigation-params channel + its consumers' pure logic.
 * (jsdom: the channel lives on `window` — in a windowless environment it
 * correctly no-ops, which is exactly what must NOT silently pass here.)
 *
 * The properties under test: params reach only the surface they were resolved
 * for (aliases applied), exactly once, within the TTL; a param-less hand-off
 * clears rather than inherits; the intelligence group match is tolerant but
 * honest (no match → null, never a fabricated group); and the pre-emptive
 * lock_info action annotates the toggle without ever engaging a drive.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  NAV_PARAMS_TTL_MS,
  clearNavParams,
  consumeNavParams,
  resolveSurfaceIdForTarget,
  stashNavParamsForTarget,
} from '../navParams';
import { matchIntelligenceGroup } from '../surfaces/Surfaces';
import { INITIAL_DRIVE_STATE, driveReducer } from '../liveDrive';

afterEach(() => clearNavParams());

describe('stash → consume', () => {
  it('delivers params to the RESOLVED surface (aliases applied), exactly once', () => {
    // 'intelligence' is a registry id whose surface is 'global-ri' via alias.
    expect(resolveSurfaceIdForTarget('intelligence')).toBe('global-ri');
    stashNavParamsForTarget('intelligence', { intelligenceTab: 'clinical' });
    expect(consumeNavParams('global-ri')).toEqual({ intelligenceTab: 'clinical' });
    // One shot — a second mount gets nothing.
    expect(consumeNavParams('global-ri')).toBeNull();
  });

  it('a different surface cannot consume (and does not burn) the entry', () => {
    stashNavParamsForTarget('section-workspace', { sectionCode: '3.2.P.8' });
    expect(consumeNavParams('global-ri')).toBeNull();
    // Still there for the surface it was meant for ('document-authoring').
    expect(consumeNavParams('document-authoring')).toEqual({ sectionCode: '3.2.P.8' });
  });

  it('a param-less navigation clears any stale entry instead of inheriting it', () => {
    stashNavParamsForTarget('authoring', { sectionCode: '2.7.3' });
    stashNavParamsForTarget('cmc', undefined);
    expect(consumeNavParams('document-authoring')).toBeNull();
    expect(consumeNavParams('cmc')).toBeNull();
  });

  it('refuses stale and future-stamped entries', () => {
    stashNavParamsForTarget('intelligence', { intelligenceTab: 'quality_cmc' });
    expect(consumeNavParams('global-ri', Date.now() + NAV_PARAMS_TTL_MS + 1000)).toBeNull();
    stashNavParamsForTarget('intelligence', { intelligenceTab: 'quality_cmc' });
    expect(consumeNavParams('global-ri', Date.now() - NAV_PARAMS_TTL_MS - 1000)).toBeNull();
  });

  it('drops empty-string params rather than delivering a blank claim', () => {
    stashNavParamsForTarget('intelligence', { intelligenceTab: '   ' });
    expect(consumeNavParams('global-ri')).toBeNull();
  });
});

describe('matchIntelligenceGroup', () => {
  const GROUPS = [
    { id: 'protocol-intel', label: 'Protocol Intelligence' },
    { id: 'cmc', label: 'CMC & Quality' },
    { id: 'reporting', label: 'Reports & Analytics' },
  ];

  it('matches by id, then by id/label containment', () => {
    expect(matchIntelligenceGroup(GROUPS, 'cmc')).toBe('cmc');
    expect(matchIntelligenceGroup(GROUPS, 'protocol')).toBe('protocol-intel');
    expect(matchIntelligenceGroup(GROUPS, 'reports')).toBe('reporting');
  });

  it('returns null honestly when nothing matches — never a fabricated group', () => {
    expect(matchIntelligenceGroup(GROUPS, 'biostat')).toBeNull();
    expect(matchIntelligenceGroup(GROUPS, '')).toBeNull();
    expect(matchIntelligenceGroup(GROUPS, null)).toBeNull();
  });
});

describe('lock_info (pre-emptive verdict)', () => {
  it('annotates the lock without engaging a drive', () => {
    const s = driveReducer(INITIAL_DRIVE_STATE, {
      kind: 'lock_info',
      lock: { reason: 'not_entitled', requiredTier: 'professional' },
    });
    expect(s.active).toBe(false);
    expect(s.lock).toEqual({ reason: 'not_entitled', requiredTier: 'professional' });
  });

  it('does not disturb a live turn, and an enabled verdict clears the lock', () => {
    let s = driveReducer(INITIAL_DRIVE_STATE, { kind: 'drive_state', enabled: true });
    s = driveReducer(s, { kind: 'lock_info', lock: null });
    expect(s.active).toBe(true);
    expect(s.lock).toBeNull();
  });
});
