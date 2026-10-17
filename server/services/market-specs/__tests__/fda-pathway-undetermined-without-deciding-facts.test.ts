/**
 * The FDA pathway is stated only from the facts that decide it (2026-10-15).
 *
 * recommendFdaPathway fell through to PMA, "No predicate available and risk not
 * established as low-to-moderate; PMA is the conservative default", whenever no
 * other branch fired: for no facts at all, and for a device stated to be Class I
 * or Class II, which is never a PMA device. Nobody had said there was no
 * predicate. It also read facts by truthiness, so predicateAvailable: 'no'
 * answered "A legally marketed predicate exists". AnA's classify_device and
 * classify_medical_device, POST /api/submissions/device/classify and the device
 * blueprint served those answers, and the readiness scorecard counted any FDA
 * answer as a determined classification.
 */
import { describe, it, expect } from 'vitest';
import { DeviceClassificationFactError, recommendFdaPathway } from '../device-classification';
import { buildDeviceBlueprint } from '../device-blueprint';
import { scorecardFromBlueprint } from '../device-readiness-scorecard';

const factKeys = (facts: string[]) => facts.map((f) => f.split(' ')[0]);

describe('recommendFdaPathway fails closed', () => {
  it('states no pathway, and no predicate finding, from no facts', () => {
    const r = recommendFdaPathway({});
    expect(r.pathway).toBe('undetermined');
    expect(factKeys(r.missingFacts)).toEqual(['predicateAvailable', 'novelLowModerateRisk']);
    expect(r.rationale).not.toMatch(/no predicate (is )?available|conservative default/i);
  });

  it('does not send a device stated to be Class I or Class II to PMA', () => {
    expect(recommendFdaPathway({ fdaClass: 'I' }).pathway).toBe('undetermined');
    expect(recommendFdaPathway({ fdaClass: 'II' }).pathway).toBe('undetermined');
  });

  it('names only the deciding fact still missing', () => {
    expect(factKeys(recommendFdaPathway({ predicateAvailable: false }).missingFacts)).toEqual(['novelLowModerateRisk']);
    expect(factKeys(recommendFdaPathway({ novelLowModerateRisk: false }).missingFacts)).toEqual(['predicateAvailable']);
  });

  it('states PMA once the facts recorded rule out 510(k) and De Novo', () => {
    expect(recommendFdaPathway({ predicateAvailable: false, novelLowModerateRisk: false })).toMatchObject({ pathway: 'pma', missingFacts: [] });
  });

  it('refuses a fact it cannot read instead of reading it by truthiness', () => {
    expect(() => recommendFdaPathway({ predicateAvailable: 'no' } as never)).toThrow(DeviceClassificationFactError);
    expect(() => recommendFdaPathway({ predicate: true } as never)).toThrow(/predicateAvailable/);
    expect(() => recommendFdaPathway({ fdaClass: 'IV' } as never)).toThrow(DeviceClassificationFactError);
  });

  it('refuses a Class III device stated to be 510(k)-exempt', () => {
    expect(() => recommendFdaPathway({ exempt: true, fdaClass: 'III' })).toThrow(DeviceClassificationFactError);
  });

  it('refuses a Class I or II device whose other facts leave only PMA', () => {
    expect(() => recommendFdaPathway({ fdaClass: 'II', predicateAvailable: false, novelLowModerateRisk: false })).toThrow(DeviceClassificationFactError);
  });

  it('keeps the pathways the stated facts decide', () => {
    expect(recommendFdaPathway({ exempt: true })).toMatchObject({ pathway: 'exempt', missingFacts: [] });
    expect(recommendFdaPathway({ fdaClass: 'III' })).toMatchObject({ pathway: 'pma', missingFacts: [] });
    expect(recommendFdaPathway({ fdaClass: 'II', predicateAvailable: true })).toMatchObject({ pathway: '510k', missingFacts: [] });
    expect(recommendFdaPathway({ novelLowModerateRisk: true })).toMatchObject({ pathway: 'de_novo', missingFacts: [] });
  });
});

describe('the readiness scorecard does not count an undetermined FDA pathway as a classification', () => {
  it('scores the classification not started and names the facts to supply', () => {
    const sc = scorecardFromBlueprint(buildDeviceBlueprint({ submissionType: '510k', classification: { framework: 'fda', facts: {} } }));
    expect(sc.dimensions.find((d) => d.id === 'classification')).toMatchObject({ status: 'not_started', score: 0 });
    expect(sc.topGaps.join(' ')).toMatch(/classification not yet determined: supply predicateAvailable/i);
  });

  it('still credits a pathway the facts decide', () => {
    const bp = buildDeviceBlueprint({ submissionType: '510k', classification: { framework: 'fda', facts: { fdaClass: 'II', predicateAvailable: true } } });
    expect(scorecardFromBlueprint(bp).dimensions.find((d) => d.id === 'classification')?.status).toBe('ready');
  });
});
