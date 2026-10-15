/**
 * The 510(k) context AnA is given states FDA's review goal in FDA days.
 *
 * What the code used to do (until 2026-10-15): it said "Review time: ~90
 * calendar days (traditional)". FDA's MDUFA goal for a 510(k) is a decision
 * within 90 FDA days — days on the review clock, which does not run while the
 * submission is on hold awaiting the sponsor's response to a request for
 * additional information — so the calendar time is routinely longer than 90.
 */
import { describe, expect, it } from 'vitest';

import { getModuleIntelligence } from '../module-intelligence';
import type { ProjectSummary } from '../user-intelligence';

const device510k: ProjectSummary = {
  id: 1,
  name: 'Device',
  submissionType: '510(k)',
  status: 'active',
  progress: null,
  phase: null,
  therapeuticArea: null,
  role: 'owner',
  lastAccessedAt: null,
};

describe('510(k) review goal', () => {
  it('is 90 FDA days on the review clock, not ~90 calendar days', () => {
    const addon = getModuleIntelligence('510k-submission', device510k)!.systemPromptAddon;

    expect(addon).toContain('510(k) Premarket Notification');
    expect(addon, 'the 510(k) review goal was stated in calendar days').not.toMatch(/90 calendar days/);
    expect(addon).toMatch(/90 FDA days/);
    expect(addon).toMatch(/on hold/);
  });
});
