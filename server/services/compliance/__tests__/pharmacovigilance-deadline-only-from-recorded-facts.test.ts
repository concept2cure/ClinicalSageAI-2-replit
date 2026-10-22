/**
 * A reporting deadline is computed only from what the case records, and a
 * clock with no deadline is undetermined — not "not breached".
 *
 * What the code used to do (until 2026-10-15):
 *   - calculateReportingDeadline gave every event type but 'AE' — an SAE, an
 *     AESI, and a missing or unknown type — the expedited 7/15-day clock. Only
 *     a serious and unexpected event (a SUSAR) is expedited (21 CFR 312.32(c));
 *     an SAE's type does not record that it is unexpected, an AESI's neither
 *     that it is serious nor unexpected;
 *   - a missing report (sponsor awareness) date defaulted to today, so the clock
 *     started on the day someone looked;
 *   - reportAdverseEvent flagged SAE and AESI intakes expedited, and a missing
 *     type not expedited;
 *   - computeReportingClock(null) reported breached:false, status 'none'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query } }));

import {
  calculateReportingDeadline,
  computeReportingClock,
  reportAdverseEvent,
  type AdverseEvent,
} from '../pharmacovigilanceService';

const REPORTED = new Date('2026-03-01T00:00:00.000Z');

/** The deadline either API shape carries (the pre-2026-10-15 one returned the Date itself). */
function deadlineOf(r: unknown): Date | null {
  return r instanceof Date ? r : (r as { deadline: Date | null }).deadline;
}
const daysAfterReport = (d: Date | null) => (d ? Math.round((d.getTime() - REPORTED.getTime()) / 86_400_000) : null);

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('calculateReportingDeadline — only a recorded serious and unexpected event starts the expedited clock', () => {
  it('a missing or unknown event type yields no deadline, with the reason', () => {
    for (const t of [undefined, null, '', 'sae']) {
      const r = calculateReportingDeadline(t as never, 'hospitalization', 'FDA', REPORTED);
      expect(deadlineOf(r), `event type ${JSON.stringify(t)} was given an expedited deadline`).toBeNull();
      expect((r as { reason?: string }).reason).toMatch(/event type not recorded/);
    }
  });

  it('an SAE or AESI type does not record that the event is unexpected: no expedited deadline, with the reason', () => {
    for (const t of ['SAE', 'AESI'] as const) {
      const r = calculateReportingDeadline(t, 'hospitalization', 'FDA', REPORTED);
      expect(deadlineOf(r), `${t} was given the expedited clock`).toBeNull();
      expect((r as { reason?: string }).reason).toMatch(new RegExp(`${t}.*not recorded as.*unexpected`));
    }
  });

  it('an unrecorded report date is not today: no deadline, with the reason', () => {
    const r = calculateReportingDeadline('SUSAR', 'hospitalization', 'FDA', undefined as never);
    expect(deadlineOf(r), 'a missing report date started the clock today').toBeNull();
    expect((r as { reason?: string }).reason).toMatch(/report date.*not recorded/);
  });

  it('a SUSAR with no seriousness criterion has no 7- or 15-day window chosen for it', () => {
    const r = calculateReportingDeadline('SUSAR', undefined as never, 'FDA', REPORTED);
    expect(deadlineOf(r)).toBeNull();
    expect((r as { reason?: string }).reason).toMatch(/seriousness criterion not recorded/);
  });

  it('a SUSAR gets 7 days when fatal or life-threatening and 15 otherwise; an AE keeps its 90-day window (control)', () => {
    expect(daysAfterReport(deadlineOf(calculateReportingDeadline('SUSAR', 'death', 'EMA', REPORTED)))).toBe(7);
    expect(daysAfterReport(deadlineOf(calculateReportingDeadline('SUSAR', 'hospitalization', 'FDA', REPORTED)))).toBe(15);
    expect(daysAfterReport(deadlineOf(calculateReportingDeadline('AE', 'hospitalization', 'FDA', REPORTED)))).toBe(90);
  });
});

describe('reportAdverseEvent — the intake records only what the type decides', () => {
  const intake = (eventType: unknown) =>
    ({
      organizationId: 'org-1', projectId: 'proj-1', eventType, patientId: 'subj-1',
      eventDescription: 'Hepatic failure', onsetDate: REPORTED, reportDate: REPORTED,
      seriousnessCriteria: 'hospitalization', causality: 'probable', outcome: 'recovering',
      reporterType: 'investigator', countryOfOccurrence: 'US', reportedToAuthorities: false,
    }) as unknown as Omit<AdverseEvent, 'id' | 'regulatoryReportingDeadline' | 'regulatoryReportingDeadlineReason' | 'expeditedReportRequired' | 'createdAt'>;

  it('an SAE is stored with no deadline, the reason, and expedited undetermined (null)', async () => {
    const e = await reportAdverseEvent(intake('SAE'));
    expect(e.regulatoryReportingDeadline, 'an SAE intake started a 15-day clock').toBeNull();
    expect(e.regulatoryReportingDeadlineReason).toMatch(/SAE.*not recorded as.*unexpected/);
    expect(e.expeditedReportRequired, 'an SAE intake was flagged expedited').toBeNull();
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[13]).toBeNull(); // regulatory_reporting_deadline
    expect(params[15]).toBeNull(); // expedited_report_required
  });

  it('a SUSAR is stored expedited with its deadline (control)', async () => {
    const e = await reportAdverseEvent(intake('SUSAR'));
    expect(daysAfterReport(e.regulatoryReportingDeadline)).toBe(15);
    expect(e.expeditedReportRequired).toBe(true);
  });
});

describe('computeReportingClock — an unknown deadline is undetermined, not "not breached"', () => {
  it('reports breached and the day-6 flag as null, status undetermined, with the reason', () => {
    const c = computeReportingClock(null, new Date('2026-06-10T00:00:00Z'));
    expect(c.breached, 'a case with no deadline read as not breached').toBeNull();
    expect(c.day6Flag).toBeNull();
    expect(c.status).toBe('undetermined');
    expect((c as { reason?: string }).reason).toMatch(/no reporting deadline is recorded/i);
  });
});
