/**
 * A complaint's patient harm is an assessment someone makes, never a default.
 *
 * The intake triage (classify) computes preliminary MDR reportability from the
 * harm. createComplaint substituted 'none' for an absent harm (and 'minor' for
 * an absent severity), and classify's 'none' branch was also its `default:` —
 * so a complaint nobody had assessed, or one sent with "unknown" or a
 * misspelling, was stamped "No harm reported — log under 820.198, no MDR".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ dbTouched: 0 }));
vi.mock('../../../db', () => {
  const touch = () => {
    H.dbTouched += 1;
    throw new Error('the database was reached before the assessment was checked');
  };
  return { db: { insert: touch, select: touch, update: touch }, pool: { query: touch, connect: touch } };
});

import { classify } from '../triageEngine';
import { createComplaint, ComplaintAssessmentRequired } from '../capaMdr.service';
import type { CapaCaller } from '../governed-context';

const CALLER: CapaCaller = { userId:7 };

const BASE = {
  programId: '11111111-1111-4111-8111-111111111111',
  source: 'customer',
  channel: 'email',
  receivedAt: new Date('2026-10-15T09:00:00Z'),
  eventNarrative: 'Device alarmed during use',
} as const;

beforeEach(() => {
  H.dbTouched = 0;
});

describe('classify refuses a harm nobody assessed', () => {
  it.each([undefined, 'unknown', 'None', ''])('patientHarm %j is refused, not read as "no harm"', (harm) => {
    expect(() => classify({ patientHarm: harm as never })).toThrow(/patientHarm must be one of/);
  });

  it('an explicit "none" is still classified as not reportable', () => {
    const result = classify({ patientHarm: 'none', isMalfunction: false });
    expect(result.fdaReportable).toBe(false);
    expect(result.rationale ?? JSON.stringify(result)).toMatch(/No harm reported/);
  });
});

describe('createComplaint requires both assessments', () => {
  it('refuses a complaint with no patient harm, before touching the database', async () => {
    await expect(
      createComplaint(3, { ...BASE, severityAssessment: 'minor' } as never, CALLER),
    ).rejects.toBeInstanceOf(ComplaintAssessmentRequired);
    expect(H.dbTouched).toBe(0);
  });

  it('refuses a complaint with no severity assessment', async () => {
    await expect(
      createComplaint(3, { ...BASE, patientHarm: 'injury' } as never, CALLER),
    ).rejects.toThrow(/severityAssessment is required/);
    expect(H.dbTouched).toBe(0);
  });
});
