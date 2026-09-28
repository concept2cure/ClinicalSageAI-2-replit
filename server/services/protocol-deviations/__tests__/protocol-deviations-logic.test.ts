/**
 * Protocol Deviations & CAPA pure logic. Rules and sources:
 * the module note of ../protocol-deviations-logic.ts and
 * docs/evidence/REGULATORY-SME/2026-09-22/.
 */
import { describe, it, expect } from 'vitest';
import { assessReportability, evaluateCapaClosure, isAssessed, CONDITIONAL_CLOCKS } from '../protocol-deviations-logic';

const r = (over: Partial<Parameters<typeof assessReportability>[0]>) =>
  assessReportability({ severity: 'minor', category: 'procedure', affectsSafety: false, ...over });

describe('an unassessed deviation is not a minor one', () => {
  it('no severity recorded → assessment required, reportability undetermined (was: minor, not reportable)', () => {
    const x = r({ severity: null, affectsSafety: null, category: null });
    expect(x.status).toBe('assessment_required');
    expect(x.reportable).toBeNull();
    expect(x.basis).toMatch(/not a minor one/);
  });

  it('severity assessed but safety impact not → still assessment required; unknown is not "no"', () => {
    const x = r({ severity: 'minor', affectsSafety: null });
    expect(x.status).toBe('assessment_required');
    expect(x.reportable).toBeNull();
  });

  it('a recorded indicator is reported even before the assessment is complete', () => {
    expect(r({ severity: null, affectsSafety: true }).status).toBe('prompt_irb_report_indicated');
    expect(r({ severity: null, affectsSafety: null, category: 'safety' }).status).toBe('prompt_irb_report_indicated');
  });

  it('isAssessed needs both severity and safety impact', () => {
    expect(isAssessed({ severity: 'major', affectsSafety: null })).toBe(false);
    expect(isAssessed({ severity: null, affectsSafety: false })).toBe(false);
    expect(isAssessed({ severity: 'minor', affectsSafety: false })).toBe(true);
  });
});

describe('what an assessment indicates', () => {
  it.each(['major', 'critical'] as const)('%s → prompt IRB report indicated, cited to 21 CFR 312.66 and the IRB\'s written procedures', (severity) => {
    const x = r({ severity });
    expect(x.status).toBe('prompt_irb_report_indicated');
    expect(x.reportable).toBe(true);
    expect(x.basis).toMatch(/21 CFR 312\.66/);
    expect(x.basis).toMatch(/written procedures/);
  });

  it('safety impact or the safety category → indicated even when minor', () => {
    expect(r({ affectsSafety: true }).reportable).toBe(true);
    expect(r({ category: 'safety' }).reportable).toBe(true);
  });

  it('minor, no safety effect → not indicated, and says it is NOT a determination that no report is needed', () => {
    const x = r({});
    expect(x.status).toBe('no_prompt_report_indicated');
    expect(x.reportable).toBe(false);
    expect(x.basis).toMatch(/NOT a determination that it need not be reported/);
    expect(x.basis).toMatch(/still reported to the sponsor/);
  });

  it('every deviation is documented, explained and reported to the sponsor (ICH E6(R2) 4.5.3)', () => {
    for (const x of [r({}), r({ severity: 'critical' }), r({ severity: null, affectsSafety: null })]) {
      expect(x.obligations.join(' ')).toMatch(/Document and explain the deviation, and report it to the sponsor \(ICH E6\(R2\) 4\.5\.3\)/);
    }
  });
});

describe('no invented reporting windows', () => {
  it('there is no 3-day / 10-day window, and no timelinessDays field', () => {
    const x = r({ severity: 'critical' }) as unknown as Record<string, unknown>;
    expect(x.timelinessDays).toBeUndefined();
    expect(JSON.stringify(x)).not.toMatch(/"days":(3|10)\b/);
  });

  it('the only fixed clocks are the conditional regulatory ones, with unit and anchor', () => {
    expect(CONDITIONAL_CLOCKS.map((c) => [c.id, c.days, c.unit])).toEqual([
      ['eu-ctr-serious-breach', 7, 'calendar'],
      ['us-device-emergency-deviation', 5, 'working'],
    ]);
    expect(CONDITIONAL_CLOCKS[0].basis).toMatch(/536\/2014, Article 52/);
    expect(CONDITIONAL_CLOCKS[1].basis).toMatch(/21 CFR 812\.150\(a\)\(4\)/);
    for (const c of CONDITIONAL_CLOCKS) expect(c.appliesIf.length).toBeGreaterThan(20);
  });

  it('never cites 45 CFR 46.108(a)(4) or the old "minor deviations are logged" reading of 4.5.3', () => {
    for (const x of [r({}), r({ severity: 'major' }), r({ severity: null, affectsSafety: null })]) {
      expect(JSON.stringify(x)).not.toMatch(/46\.108\(a\)\(4\)/);
      expect(JSON.stringify(x)).not.toMatch(/logged and summarized rather than promptly reported/);
    }
  });
});

describe('evaluateCapaClosure', () => {
  const done = [{ status: 'completed' as const }, { status: 'verified' as const }];

  it('is ready when assessed and every CAPA action is completed/verified', () => {
    const x = evaluateCapaClosure({ deviationStatus: 'capa_pending', capaActions: done, assessed: true });
    expect(x.readyToClose).toBe(true);
    expect(x.blockers).toEqual([]);
  });

  it('refuses to close a deviation nobody assessed — including a legacy "minor"', () => {
    const x = evaluateCapaClosure({ deviationStatus: 'capa_pending', capaActions: done, assessed: false });
    expect(x.readyToClose).toBe(false);
    expect(x.blockers.join(' ')).toMatch(/have not been assessed/);
  });

  it('blocks when a CAPA action is still open/in_progress', () => {
    const x = evaluateCapaClosure({ deviationStatus: 'capa_pending', capaActions: [{ status: 'completed' }, { status: 'in_progress' }], assessed: true });
    expect(x.readyToClose).toBe(false);
    expect(x.blockers.some((b) => /not yet completed/i.test(b))).toBe(true);
  });

  it('blocks when there are no CAPA actions', () => {
    const x = evaluateCapaClosure({ deviationStatus: 'open', capaActions: [], assessed: true });
    expect(x.blockers.some((b) => /No CAPA actions/i.test(b))).toBe(true);
  });

  it('blocks closing an already-closed deviation', () => {
    const x = evaluateCapaClosure({ deviationStatus: 'closed', capaActions: [{ status: 'verified' }], assessed: true });
    expect(x.blockers.some((b) => /already closed/i.test(b))).toBe(true);
  });
});
