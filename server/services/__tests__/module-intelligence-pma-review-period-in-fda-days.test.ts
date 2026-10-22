/**
 * The PMA (and De Novo) context AnA is given states FDA's review period in FDA
 * days, citing what this repository holds.
 *
 * What the code used to do (until 2026-10-15): it said "Review time: ~180
 * calendar days (standard), ~60 days (PMA supplement)" and, for De Novo, "~150
 * calendar days". The repository holds the PMA period as 180 days under FD&C Act
 * §515(d)(1) (submission-readiness-twin-service.ts) and the MDUFA decision goals as
 * ≈ 180 and ≈ 150 FDA days, with the clock stopped while the applicant is answering
 * (market-specs/regulatory-timelines.ts) — so calendar time runs longer. Nothing in
 * it supports "~60 days" for a PMA supplement: its supplement clocks are 180 days
 * (180-day and panel-track), 30 (30-day notice) and none (real-time) under
 * 21 CFR 814.39 (pathway-engines/estar/estar-catalog.ts).
 */
import { describe, expect, it } from 'vitest';

import { getModuleIntelligence } from '../module-intelligence';
import type { ProjectSummary } from '../user-intelligence';

const device = (submissionType: string): ProjectSummary => ({
  id: 1,
  name: 'Device',
  submissionType,
  status: 'active',
  progress: null,
  phase: null,
  therapeuticArea: null,
  role: 'owner',
  lastAccessedAt: null,
});

describe('PMA review period', () => {
  it('is 180 FDA days on the review clock under FD&C Act §515(d)(1), not ~180 calendar days', () => {
    const addon = getModuleIntelligence('pma-submission', device('PMA'))!.systemPromptAddon;

    expect(addon).toContain('Premarket Approval (PMA)');
    expect(addon, 'the PMA review period was stated in calendar days').not.toMatch(/180 calendar days/);
    expect(addon).toMatch(/180 FDA days/);
    expect(addon).toMatch(/§515\(d\)\(1\)/);
    expect(addon).toMatch(/on hold/);
    expect(addon, 'a supplement clock the repository does not hold').not.toMatch(/~60 days/);
    expect(addon).toMatch(/21 CFR 814\.39/);
  });
});

describe('De Novo review goal', () => {
  it('is 150 FDA days on the review clock, not ~150 calendar days', () => {
    const addon = getModuleIntelligence('510k-submission', device('De Novo'))!.systemPromptAddon;

    expect(addon).toContain('De Novo Classification Request');
    expect(addon, 'the De Novo review goal was stated in calendar days').not.toMatch(/150 calendar days/);
    expect(addon).toMatch(/150 FDA days/);
  });
});
