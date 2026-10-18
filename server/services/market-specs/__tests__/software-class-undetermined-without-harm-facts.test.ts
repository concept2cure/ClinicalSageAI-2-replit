/**
 * The IEC 62304 software safety class is stated only from stated harm facts
 * (2026-10-15).
 *
 * classifySoftware read an unstated harm fact as "no". With neither fact it
 * returned Class A, "No injury or damage to health is possible from a software
 * failure"; with only canContributeToNonSeriousInjury it returned Class B, which
 * says death or serious injury is not possible. buildDeviceBlueprint then
 * required only the Class A deliverables (no architecture, detailed design or
 * integration testing), assessed the module against them, and
 * scorecardFromBlueprint scored software "ready", 100. The build_device_blueprint
 * tool and POST /api/submissions/device/blueprint served that.
 */
import { describe, it, expect } from 'vitest';
import { classifySoftware, deliverablesForClass, SOFTWARE_DELIVERABLES } from '../software-lifecycle';
import { buildDeviceBlueprint } from '../device-blueprint';
import { scorecardFromBlueprint } from '../device-readiness-scorecard';

const CLASS_A_IDS = SOFTWARE_DELIVERABLES.filter((d) => d.classes.includes('A')).map((d) => d.id);
const factKeys = (facts: string[]) => facts.map((f) => f.split(' ')[0]);

describe('classifySoftware states no IEC 62304 class that an unstated harm fact could change', () => {
  it('is undetermined, naming both facts, when neither harm fact is stated', () => {
    const c = classifySoftware({});
    expect(c.class).toBe('undetermined');
    expect(factKeys(c.missingFacts)).toEqual(['canContributeToDeathOrSeriousInjury', 'canContributeToNonSeriousInjury']);
    expect(c.rationale).not.toMatch(/no injury/i);
  });

  it('is undetermined (at least Class B), not Class B, when only non-serious injury is stated', () => {
    const c = classifySoftware({ canContributeToNonSeriousInjury: true });
    expect(c.class).toBe('undetermined');
    expect(factKeys(c.missingFacts)).toEqual(['canContributeToDeathOrSeriousInjury']);
    expect(c.rationale).toMatch(/at least Class B/);
  });

  it('is undetermined when one harm fact is stated false and the other is not stated', () => {
    expect(factKeys(classifySoftware({ canContributeToDeathOrSeriousInjury: false }).missingFacts)).toEqual(['canContributeToNonSeriousInjury']);
    expect(factKeys(classifySoftware({ canContributeToNonSeriousInjury: false }).missingFacts)).toEqual(['canContributeToDeathOrSeriousInjury']);
  });

  it('does not read a value that is not true or false as a stated fact', () => {
    const c = classifySoftware({ canContributeToDeathOrSeriousInjury: 'no' as never, canContributeToNonSeriousInjury: false });
    expect(c.class).toBe('undetermined');
  });

  it('states Class A, B and C from stated facts', () => {
    expect(classifySoftware({ canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false })).toMatchObject({ class: 'A', missingFacts: [] });
    expect(classifySoftware({ canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: true })).toMatchObject({ class: 'B', missingFacts: [] });
    expect(classifySoftware({ canContributeToDeathOrSeriousInjury: true })).toMatchObject({ class: 'C', missingFacts: [] });
  });

  it('drops no deliverable while the class is undetermined', () => {
    expect(deliverablesForClass('undetermined').map((d) => d.id)).toEqual(SOFTWARE_DELIVERABLES.map((d) => d.id));
  });
});

describe('the blueprint and scorecard do not assess software whose class is undetermined', () => {
  const bp = buildDeviceBlueprint({ submissionType: '510k', software: { applicable: true, presentDeliverableIds: CLASS_A_IDS } });
  const detail = bp.evidenceModules.find((m) => m.id === 'software')!.detail as {
    classification: { class: string };
    deliverables: Array<{ id: string }>;
    assessment?: { status?: string; ready?: boolean };
  };

  it('marks the software module not assessed and keeps the Class B/C deliverables listed', () => {
    expect(detail.classification.class).toBe('undetermined');
    expect(detail.assessment).toMatchObject({ status: 'not_assessed' });
    expect(detail.assessment?.ready).not.toBe(true);
    expect(detail.deliverables.map((d) => d.id)).toEqual(expect.arrayContaining(['architecture', 'detailed_design', 'integration_testing']));
  });

  it('does not report the evidence ready', () => {
    expect(bp.evidenceReady).toBe(false);
  });

  it('scores the software dimension not assessed, naming the facts to supply', () => {
    const sc = scorecardFromBlueprint(bp);
    expect(sc.dimensions.find((d) => d.id === 'evidence:software')).toMatchObject({ status: 'not_assessed', score: 0 });
    expect(sc.topGaps.join(' ')).toMatch(/Software Lifecycle \(IEC 62304\) is not assessed: supply canContributeToDeathOrSeriousInjury/);
  });

  it('still assesses and credits a class stated from facts', () => {
    const stated = buildDeviceBlueprint({
      submissionType: '510k',
      software: { applicable: true, canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false, presentDeliverableIds: CLASS_A_IDS },
    });
    expect(scorecardFromBlueprint(stated).dimensions.find((d) => d.id === 'evidence:software')?.status).toBe('ready');
  });
});
