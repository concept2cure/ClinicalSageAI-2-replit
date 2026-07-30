/**
 * Unit tests for the pure Schedule-of-Events logic: template resolution,
 * deterministic schedule generation, and milestone health assessment. No DB —
 * these cover the regulatory-aware planning + proactive-monitoring brains.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../generator';
import { assessScheduleHealth, type MilestoneHealthInput } from '../health';
import { getScheduleTemplate, listSupportedTypes } from '../templates';

const DAY = 86_400_000;

describe('schedule templates', () => {
  it('resolves known submission types', () => {
    expect(getScheduleTemplate('IND').type).toBe('IND');
    expect(getScheduleTemplate('510K').type).toBe('510K');
    expect(getScheduleTemplate('510(k)').type).toBe('510K');
    expect(getScheduleTemplate('de novo').type).toBe('DE_NOVO');
  });

  it('falls back to a generic template for unknown types', () => {
    expect(getScheduleTemplate('something-weird').type).toBe('GENERIC');
    expect(getScheduleTemplate(null).type).toBe('GENERIC');
  });

  it('resolves Japan and Canada filings (regions that already have eCTD backbones)', () => {
    expect(getScheduleTemplate('SHONIN').type).toBe('SHONIN');
    expect(getScheduleTemplate('Shōnin').type).toBe('SHONIN'); // non-ASCII normalizes via alias
    expect(getScheduleTemplate('PMDA').type).toBe('SHONIN');
    expect(getScheduleTemplate('NDS').type).toBe('NDS');
    expect(getScheduleTemplate('New Drug Submission').type).toBe('NDS');
    expect(getScheduleTemplate('Health Canada').type).toBe('NDS');
  });

  it('resolves the FDA device request types', () => {
    expect(getScheduleTemplate('Q-Sub').type).toBe('Q_SUB');
    expect(getScheduleTemplate('Pre-Sub').type).toBe('Q_SUB');
    expect(getScheduleTemplate('Q Submission').type).toBe('Q_SUB');
    expect(getScheduleTemplate('IDE').type).toBe('IDE');
    expect(getScheduleTemplate('513(g)').type).toBe('513G');
    expect(getScheduleTemplate('513g').type).toBe('513G');
  });

  it('grounds the new templates in their real regulatory frameworks', () => {
    expect(getScheduleTemplate('SHONIN').framework).toBe('PMDA');
    expect(getScheduleTemplate('NDS').framework).toBe('Health Canada');
    // Every milestone that cites a basis cites a real one (no empty strings).
    for (const t of ['SHONIN', 'NDS', 'Q_SUB', 'IDE', '513G']) {
      const tpl = getScheduleTemplate(t);
      expect(tpl.milestones.length).toBeGreaterThan(0);
      for (const m of tpl.milestones) {
        if (m.regulatoryBasis !== undefined) expect(m.regulatoryBasis.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every dependsOn pointing at a real milestone key in the same template', () => {
    for (const t of listSupportedTypes()) {
      const tpl = getScheduleTemplate(t);
      const keys = new Set(tpl.milestones.map((m) => m.key));
      for (const m of tpl.milestones) {
        for (const dep of m.dependsOn ?? []) {
          expect(keys.has(dep)).toBe(true);
        }
      }
    }
  });

  it('ends each new template with its submission/decision milestone', () => {
    // The last milestone should be the terminal event, so schedule end-dates are honest.
    expect(getScheduleTemplate('SHONIN').milestones.at(-1)?.key).toBe('shonin_submission');
    expect(getScheduleTemplate('NDS').milestones.at(-1)?.key).toBe('screening_acceptance');
    expect(getScheduleTemplate('IDE').milestones.at(-1)?.key).toBe('ide_decision');
    expect(getScheduleTemplate('513G').milestones.at(-1)?.key).toBe('pathway_decision');
  });

  it('exposes the supported type list', () => {
    expect(listSupportedTypes()).toEqual(
      expect.arrayContaining(['IND', 'NDA', '510K', 'CER', 'SHONIN', 'NDS', 'Q_SUB', 'IDE', '513G']),
    );
  });
});

describe('generateSchedule', () => {
  const baseline = new Date('2026-01-01T00:00:00.000Z');

  it('anchors milestones at the baseline and grounds them in the framework', () => {
    const s = generateSchedule({ projectType: 'IND', baselineDate: baseline });
    expect(s.framework).toBe('FDA');
    expect(s.milestones.length).toBeGreaterThan(5);
    // First milestone (offset 0) sits on the baseline.
    expect(s.milestones[0].targetDate.getTime()).toBe(baseline.getTime());
    // Milestones are ordered.
    for (let i = 1; i < s.milestones.length; i++) {
      expect(s.milestones[i].sortOrder).toBeGreaterThan(s.milestones[i - 1].sortOrder);
    }
    // Critical-path + regulatory basis surfaced.
    expect(s.milestones.some((m) => m.isCritical)).toBe(true);
    expect(s.milestones.some((m) => m.regulatoryBasis)).toBe(true);
  });

  it('compresses the timeline to hit an aggressive target and lowers confidence', () => {
    // IND nominal is ~365d; ask for ~120d → heavy compression.
    const target = new Date(baseline.getTime() + 120 * DAY);
    const s = generateSchedule({ projectType: 'IND', baselineDate: baseline, targetDate: target });
    const last = s.milestones[s.milestones.length - 1];
    // Final milestone lands on/before the requested window (clamped, so allow slack).
    expect(last.targetDate.getTime()).toBeLessThan(baseline.getTime() + 365 * DAY);
    expect(s.confidence).toBe('low');
    expect(s.basisSummary).toContain('compressed');
  });

  it('uses the earliest goal target as a pull-forward constraint', () => {
    const goalTarget = new Date(baseline.getTime() + 200 * DAY).toISOString();
    const s = generateSchedule({
      projectType: 'NDA',
      baselineDate: baseline,
      goals: [{ title: 'File early', targetDate: goalTarget }],
    });
    const last = s.milestones[s.milestones.length - 1];
    // NDA nominal is 540d; the 200d goal must compress it well below nominal.
    expect(last.targetDate.getTime()).toBeLessThan(baseline.getTime() + 540 * DAY);
  });
});

describe('assessScheduleHealth', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const mk = (over: Partial<MilestoneHealthInput>): MilestoneHealthInput => ({
    key: 'k',
    title: 'M',
    status: 'not_started',
    targetDate: null,
    isCritical: false,
    progress: 0,
    ...over,
  });

  it('flags an overdue, incomplete milestone as slipped', () => {
    const past = new Date(now.getTime() - 10 * DAY);
    const h = assessScheduleHealth([mk({ key: 'a', targetDate: past })], { now });
    expect(h.milestones[0].nextStatus).toBe('slipped');
    expect(h.milestones[0].slipDays).toBe(10);
    expect(h.slipped).toBe(1);
    expect(h.overallStatus).toBe('off_track');
  });

  it('flags a soon-due, not-started milestone as at risk', () => {
    const soon = new Date(now.getTime() + 5 * DAY);
    const h = assessScheduleHealth([mk({ key: 'b', targetDate: soon, status: 'not_started' })], { now });
    expect(h.milestones[0].nextStatus).toBe('at_risk');
    expect(h.overallStatus).toBe('at_risk');
  });

  it('treats a comfortably-future milestone as on track', () => {
    const later = new Date(now.getTime() + 90 * DAY);
    const h = assessScheduleHealth([mk({ key: 'c', targetDate: later, status: 'in_progress', progress: 40 })], { now });
    expect(h.milestones[0].nextStatus).toBe('in_progress');
    expect(h.overallStatus).toBe('on_track');
  });

  it('does not disturb completed milestones and reports overall on_track', () => {
    const past = new Date(now.getTime() - 30 * DAY);
    const h = assessScheduleHealth(
      [mk({ key: 'd', targetDate: past, status: 'completed', progress: 100 })],
      { now },
    );
    expect(h.milestones[0].nextStatus).toBe('completed');
    expect(h.milestones[0].changed).toBe(false);
    expect(h.completed).toBe(1);
    expect(h.overallStatus).toBe('on_track');
  });

  it('escalates overall to off_track when a critical milestone slips', () => {
    const past = new Date(now.getTime() - 3 * DAY);
    const soon = new Date(now.getTime() + 5 * DAY);
    const h = assessScheduleHealth(
      [
        mk({ key: 'crit', targetDate: past, isCritical: true }),
        mk({ key: 'risk', targetDate: soon }),
      ],
      { now },
    );
    expect(h.overallStatus).toBe('off_track');
    expect(h.milestones.find((m) => m.key === 'crit')?.isCritical).toBe(true);
  });
});
