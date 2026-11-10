/**
 * P-122 (2026-11-10): the IND screen shows the registers the IND lifecycle routes keep, and production serves exactly
 * the paths it calls.
 *
 * The registers (`server/routes/ind-lifecycle/registers.routes.ts`) were built and had no screen; nothing claimed
 * them, so production refused every one as unattributed (P-122 inventory, vault-authoring-submission.md §3.1, §4 #6).
 * The IND screen (`IndLifecycle.tsx`, the `ind-checklist` surface, a feature of Submission Center by P-32) now calls
 * them from `SubmissionIndRegisters.tsx`.
 *
 * The safety-report and ICSR registers sit beside them under the same `/submission/:id` segment, and P-32 keeps them
 * shut. So each claim names the register by a `:param` segment (api-prefix-map.ts), and the safety registers stay
 * unattributed (ind-launch-claim.test.ts asserts it from the routers themselves).
 */
import { describe, expect, it } from 'vitest';
import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();
const verdict = (path: string) => launchScopeApiVerdict(path, prefixMap, NEVER_GATED);
const claimedBy = (path: string) => [...(modulesForPath(path.toLowerCase(), prefixMap) ?? [])];

describe('the cross-reference and letter of authorization register is served on the IND screen', () => {
  it.each([
    '/api/ind-lifecycle/submission/7/cross-references', //                         the list, and recording one
    '/api/ind-lifecycle/submission/7/cross-reference-register', //                 the LOA-coverage QC
    '/api/ind-lifecycle/submission/7/cross-references/0b6d2c8e-1111-4c4c-8c8c-123456789abc/file-loa', // filing the letter
    '/api/ind-lifecycle/cross-references/0b6d2c8e-1111-4c4c-8c8c-123456789abc', // marking it on file, removing it
    // ci:launch-scope-api reads a template literal's `${…}` as `:p`.
    '/api/ind-lifecycle/submission/:p/cross-references',
    '/api/ind-lifecycle/submission/:p/cross-reference-register',
    '/api/ind-lifecycle/submission/:p/cross-references/:p/file-loa',
    '/api/ind-lifecycle/cross-references/:p',
  ])('%s', (path) => {
    expect(verdict(path)).toBe('launch');
    expect(claimedBy(path)).toEqual(['ind-checklist']);
  });
});

describe('the annual-report tracker is served on the IND screen', () => {
  it.each([
    '/api/ind-lifecycle/submission/7/annual-reports', //          the tracked reports, and tracking one
    '/api/ind-lifecycle/submission/7/annual-reports/overdue', //  the server's overdue feed
    '/api/ind-lifecycle/submission/7/annual-reports/overdue?asOf=2030-01-01',
    '/api/ind-lifecycle/submission/:p/annual-reports',
    '/api/ind-lifecycle/submission/:p/annual-reports/overdue',
  ])('%s', (path) => {
    expect(verdict(path)).toBe('launch');
    expect(claimedBy(path)).toEqual(['ind-checklist']);
  });

  it('one stored report by its id has no screen caller, and stays unattributed', () => {
    expect(verdict('/api/ind-lifecycle/annual-reports/0b6d2c8e-1111-4c4c-8c8c-123456789abc')).toBe('unmapped');
  });
});

describe('nothing beside the registers the screen calls is admitted', () => {
  it.each([
    // P-32: the IND safety-report and ICSR registers stay shut.
    '/api/ind-lifecycle/submission/7/safety-reports',
    '/api/ind-lifecycle/submission/7/safety-reports/overdue',
    '/api/ind-lifecycle/submission/7/icsr-transmissions',
    // The per-IND roll-ups and the bare submission segment have no screen caller.
    '/api/ind-lifecycle/submission/7',
    '/api/ind-lifecycle/submission/7/overview',
    '/api/ind-lifecycle/submission/7/cockpit',
    '/api/ind-lifecycle/submission/7/drift',
    // A parameter is one segment: it never spans two, and never matches an empty one.
    '/api/ind-lifecycle/submission/7/8/cross-references',
    '/api/ind-lifecycle/submission//cross-references',
    '/api/ind-lifecycle/submission/7/cross-referencesx',
  ])('%s stays unattributed', (path) => {
    expect(verdict(path)).toBe('unmapped');
  });

  it('the stateless cross-reference register engine is not the stored one, and stays unattributed', () => {
    expect(verdict('/api/ind-lifecycle/cross-reference-register')).toBe('unmapped');
  });
});
