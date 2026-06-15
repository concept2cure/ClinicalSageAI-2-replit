/**
 * Health Authority meetings expert — catalog integrity + milestone-based
 * recommendations across markets.
 */

import { describe, it, expect } from 'vitest';
import { recommendMeetings, meetingsForMarket, MEETING_CATALOG, type MeetingMarket } from '../ha-meetings';

const MARKETS: MeetingMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'];

describe('MEETING_CATALOG', () => {
  it('is well-formed (unique codes, market populated, ≥1 milestone each)', () => {
    const codes = MEETING_CATALOG.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const m of MEETING_CATALOG) {
      expect(MARKETS).toContain(m.market);
      expect(m.milestones.length).toBeGreaterThan(0);
      expect(m.name).toBeTruthy();
    }
  });

  it('every market has at least one meeting', () => {
    for (const m of MARKETS) expect(meetingsForMarket(m).length).toBeGreaterThan(0);
  });
});

describe('recommendMeetings', () => {
  it('recommends a Pre-IND meeting (FDA) for the pre_ind milestone', () => {
    const res = recommendMeetings({ market: 'FDA', milestone: 'pre_ind' });
    expect(res.recommended.some((m) => m.code === 'fda_type_b_pre_ind')).toBe(true);
  });

  it('recommends the End-of-Phase 2 meeting (FDA) for end_of_phase_2', () => {
    const res = recommendMeetings({ market: 'FDA', milestone: 'end_of_phase_2' });
    expect(res.recommended.map((m) => m.code)).toContain('fda_type_b_eop2');
  });

  it('recommends a Type A meeting for a clinical hold, with the soonest target first', () => {
    const res = recommendMeetings({ market: 'FDA', milestone: 'clinical_hold' });
    expect(res.recommended[0].code).toBe('fda_type_a');
    expect(res.recommended[0].schedulingTargetDays).toBe(30);
  });

  it('orders recommendations by soonest scheduling target', () => {
    const res = recommendMeetings({ market: 'FDA', milestone: 'general' });
    const targets = res.recommended.map((m) => m.schedulingTargetDays ?? Number.MAX_SAFE_INTEGER);
    const sorted = [...targets].sort((a, b) => a - b);
    expect(targets).toEqual(sorted);
  });

  it('recommends EMA Scientific Advice for early development', () => {
    const res = recommendMeetings({ market: 'EMA', milestone: 'end_of_phase_1' });
    expect(res.recommended.some((m) => m.code === 'ema_scientific_advice')).toBe(true);
  });

  it('notes when no meeting is modeled for a milestone', () => {
    const res = recommendMeetings({ market: 'PMDA', milestone: 'clinical_hold' });
    expect(res.recommended).toEqual([]);
    expect(res.notes.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = recommendMeetings({ market: 'FDA', milestone: 'pre_nda' });
    const b = recommendMeetings({ market: 'FDA', milestone: 'pre_nda' });
    expect(a).toEqual(b);
  });
});
