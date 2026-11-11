/**
 * P-122 (2026-11-10): Submission Center's eCTD view shows a sequence's QC, and production serves exactly that.
 *
 * `GET /api/ind-lifecycle/sequence/:id/diff` (what changed against the previous sequence) and `/manifest` (every leaf
 * by module, with its checksum) were built and never called; CLAUDE.md Rule 3 names them. Nothing claimed
 * `/api/ind-lifecycle/sequence`, so production refused both as unattributed. The eCTD view
 * (`EctdSequenceQc.tsx`, mounted in `EctdCompile.tsx`) now calls them.
 *
 * The matcher had no parameters, so the only claim that could admit them was the segment
 * `/api/ind-lifecycle/sequence`, which admits everything mounted beneath it: the dispatch gate and its persisted
 * snapshot as well, which no screen calls and which ind-launch-claim.test.ts keeps out ("none of the uncalled
 * lifecycle engines"). A claim may now name a `:param` segment, which stands for exactly one path segment, so the
 * claim is the two routes and their PDF renders, and nothing beside them.
 */
import { describe, expect, it } from 'vitest';
import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();
const verdict = (path: string) => launchScopeApiVerdict(path, prefixMap, NEVER_GATED);

describe('the eCTD view\'s sequence QC is served in production', () => {
  it.each([
    '/api/ind-lifecycle/sequence/7/diff',
    '/api/ind-lifecycle/sequence/7/diff?priorId=6',
    '/api/ind-lifecycle/sequence/7/manifest',
    // ci:launch-scope-api reads a template literal's `${…}` as `:p`.
    '/api/ind-lifecycle/sequence/:p/diff',
    '/api/ind-lifecycle/sequence/:p/manifest',
  ])('%s', (path) => {
    expect(verdict(path)).toBe('launch');
    expect([...(modulesForPath(path.toLowerCase(), prefixMap) ?? [])]).toEqual(['ectd-compile']);
  });

  it('the PDF render of each is the same deliverable, admitted beneath it', () => {
    expect(verdict('/api/ind-lifecycle/sequence/7/diff/pdf')).toBe('launch');
    expect(verdict('/api/ind-lifecycle/sequence/7/manifest/pdf')).toBe('launch');
  });
});

describe('nothing else under /sequence is admitted', () => {
  it.each([
    '/api/ind-lifecycle/sequence',
    '/api/ind-lifecycle/sequence/7',
    '/api/ind-lifecycle/sequence/7/validate',
    '/api/ind-lifecycle/sequence/7/dispatch-gate',
    '/api/ind-lifecycle/sequence/7/dispatch-gate/snapshot',
    '/api/ind-lifecycle/sequence/7/snapshots',
  ])('%s stays unattributed', (path) => {
    expect(verdict(path)).toBe('unmapped');
  });

  it('a parameter is one segment: it never spans two, and never matches an empty one', () => {
    expect(verdict('/api/ind-lifecycle/sequence/7/8/diff')).toBe('unmapped');
    expect(verdict('/api/ind-lifecycle/sequence//diff')).toBe('unmapped');
    expect(verdict('/api/ind-lifecycle/sequence/7/diffx')).toBe('unmapped');
  });
});

describe('a parameter claim beside a plain one', () => {
  const map = buildPrefixMap([
    { id: 'plain', apiPrefixes: ['/api/x'] },
    { id: 'param', apiPrefixes: ['/api/x/:id/report'] },
  ]);
  it('the longer claim wins, as a longer plain prefix does', () => {
    expect([...(modulesForPath('/api/x/12/report', map) ?? [])]).toEqual(['param']);
    expect([...(modulesForPath('/api/x/12/report/pdf', map) ?? [])]).toEqual(['param']);
    expect([...(modulesForPath('/api/x/12/other', map) ?? [])]).toEqual(['plain']);
  });
  it('a claim with no parameter matches as it always has', () => {
    expect([...(modulesForPath('/api/x', map) ?? [])]).toEqual(['plain']);
    expect([...(modulesForPath('/api/x?y=1', map) ?? [])]).toEqual(['plain']);
    expect(modulesForPath('/api/xy', map)).toBeNull();
  });
});
