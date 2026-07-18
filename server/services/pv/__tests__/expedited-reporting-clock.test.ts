import { describe, it, expect } from 'vitest';
import {
  computeExpeditedReportingClock,
  type ExpeditedReportingClockInput,
} from '../expedited-reporting-clock';

/**
 * Patient-safety-critical unit tests for the IND expedited-reporting clock
 * (21 CFR 312.32(c) / ICH E2A). `today` is injected so every day-count is
 * deterministic and timezone-independent.
 */

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('computeExpeditedReportingClock — category determination', () => {
  it('7-day: serious + unexpected + suspected + fatal', () => {
    const input: ExpeditedReportingClockInput = {
      awarenessDate: '2026-07-10',
      seriousnessCriteria: ['death', 'hospitalization'],
      causality: 'related',
      expectedness: 'unexpected',
      outcome: 'fatal',
    };
    const r = computeExpeditedReportingClock(input, utc('2026-07-12'));
    expect(r.category).toBe('7-day');
    expect(r.clockStart).toBe('2026-07-10');
    expect(r.dueDate).toBe('2026-07-17');
    expect(r.daysRemaining).toBe(5);
    expect(r.overdue).toBe(false);
  });

  it('7-day: life-threatening criterion (not death) also triggers the 7-day clock', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-10',
        seriousnessCriteria: ['life-threatening', 'hospitalization'],
        causality: 'related',
        expectedness: 'unexpected',
        outcome: 'recovered',
      },
      utc('2026-07-11'),
    );
    expect(r.category).toBe('7-day');
    expect(r.dueDate).toBe('2026-07-17');
  });

  it('15-day: serious + unexpected + suspected but NOT fatal/life-threatening', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['hospitalization', 'medically important'],
        causality: 'possibly related',
        expectedness: 'unexpected',
        outcome: 'recovering',
      },
      utc('2026-07-05'),
    );
    expect(r.category).toBe('15-day');
    expect(r.clockStart).toBe('2026-07-01');
    expect(r.dueDate).toBe('2026-07-16');
    expect(r.daysRemaining).toBe(11);
    expect(r.overdue).toBe(false);
  });

  it('none: EXPECTED (listed) event has no expedited clock even when serious+suspected', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['medically important'],
        causality: 'probably related',
        expectedness: 'expected',
        outcome: 'recovering',
      },
      utc('2026-07-05'),
    );
    expect(r.category).toBe('none');
    expect(r.clockStart).toBeNull();
    expect(r.dueDate).toBeNull();
    expect(r.daysRemaining).toBeNull();
    expect(r.overdue).toBe(false);
    expect(r.basis).toMatch(/not unexpected/);
  });

  it('none: not suspected causality (unlikely/ not related)', () => {
    const notRelated = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['hospitalization'],
        causality: 'not related',
        expectedness: 'unexpected',
      },
      utc('2026-07-05'),
    );
    expect(notRelated.category).toBe('none');

    const unlikely = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['hospitalization'],
        causality: 'unlikely related',
        expectedness: 'unexpected',
      },
      utc('2026-07-05'),
    );
    expect(unlikely.category).toBe('none');
    expect(unlikely.basis).toMatch(/no suspected causality/);
  });

  it('none: not serious (no seriousness criteria)', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: [],
        causality: 'related',
        expectedness: 'unexpected',
      },
      utc('2026-07-05'),
    );
    expect(r.category).toBe('none');
    expect(r.basis).toMatch(/not serious/);
  });

  it("suspected includes possibly related; 'possibly related' maps to a clock", () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['hospitalization'],
        causality: 'possibly related',
        expectedness: 'unexpected',
      },
      utc('2026-07-05'),
    );
    expect(r.category).toBe('15-day');
  });
});

describe('computeExpeditedReportingClock — overdue vs not (injected today)', () => {
  const base: ExpeditedReportingClockInput = {
    awarenessDate: '2026-07-01',
    seriousnessCriteria: ['life-threatening'],
    causality: 'related',
    expectedness: 'unexpected',
  };
  // 7-day clock from 2026-07-01 ⇒ due 2026-07-08.

  it('not overdue before the due date', () => {
    const r = computeExpeditedReportingClock(base, utc('2026-07-05'));
    expect(r.dueDate).toBe('2026-07-08');
    expect(r.daysRemaining).toBe(3);
    expect(r.overdue).toBe(false);
  });

  it('overdue after the due date, with negative days remaining', () => {
    const r = computeExpeditedReportingClock(base, utc('2026-07-10'));
    expect(r.daysRemaining).toBe(-2);
    expect(r.overdue).toBe(true);
  });
});

describe('computeExpeditedReportingClock — boundary: exactly on the due date', () => {
  it('daysRemaining 0 and NOT overdue on the due date itself', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['hospitalization'],
        causality: 'related',
        expectedness: 'unexpected',
      },
      utc('2026-07-16'), // 15-day clock due exactly 2026-07-16
    );
    expect(r.dueDate).toBe('2026-07-16');
    expect(r.daysRemaining).toBe(0);
    expect(r.overdue).toBe(false);
  });

  it('one day past due is overdue', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['hospitalization'],
        causality: 'related',
        expectedness: 'unexpected',
      },
      utc('2026-07-17'),
    );
    expect(r.daysRemaining).toBe(-1);
    expect(r.overdue).toBe(true);
  });
});

describe('computeExpeditedReportingClock — missing/invalid awareness date (fail safe)', () => {
  it('category still classified but due date / days remaining null, overdue false', () => {
    for (const awarenessDate of [undefined, null, '', 'not-a-date', '2026-13-40']) {
      const r = computeExpeditedReportingClock(
        {
          awarenessDate: awarenessDate as string | null | undefined,
          seriousnessCriteria: ['death'],
          causality: 'related',
          expectedness: 'unexpected',
        },
        utc('2026-07-17'),
      );
      expect(r.category).toBe('7-day');
      expect(r.clockStart).toBeNull();
      expect(r.dueDate).toBeNull();
      expect(r.daysRemaining).toBeNull();
      expect(r.overdue).toBe(false);
      expect(r.basis).toMatch(/cannot be anchored/);
    }
  });

  it("'none' with a missing awareness date is still clean nulls", () => {
    const r = computeExpeditedReportingClock(
      { awarenessDate: null, seriousnessCriteria: [], causality: 'not related', expectedness: 'expected' },
      utc('2026-07-17'),
    );
    expect(r.category).toBe('none');
    expect(r.dueDate).toBeNull();
    expect(r.overdue).toBe(false);
  });
});

describe('computeExpeditedReportingClock — robustness', () => {
  it('normalizes case/whitespace in inputs', () => {
    const r = computeExpeditedReportingClock(
      {
        awarenessDate: '2026-07-01',
        seriousnessCriteria: ['  Life-Threatening  '],
        causality: '  Related ',
        expectedness: ' Unexpected ',
      },
      utc('2026-07-02'),
    );
    expect(r.category).toBe('7-day');
  });

  it('defaults today to now when not injected (smoke test — no throw, shape intact)', () => {
    const r = computeExpeditedReportingClock({
      awarenessDate: '2026-07-01',
      seriousnessCriteria: ['hospitalization'],
      causality: 'related',
      expectedness: 'unexpected',
    });
    expect(r.category).toBe('15-day');
    expect(r.dueDate).toBe('2026-07-16');
    expect(typeof r.overdue).toBe('boolean');
    expect(typeof r.daysRemaining).toBe('number');
  });
});
