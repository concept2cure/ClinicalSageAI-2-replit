/**
 * One vocabulary for the risk classes, with the two MDR shapes related rather
 * than reconciled (founder's directive, 2026-10-12).
 *
 * A read-only sweep found the US class enumerated at least fifteen times in
 * three value sets, the MDR class in two shapes, and the IVDR class A–D in
 * eight places and asked by no question anywhere. The two MDR shapes are both
 * right and that is the point: a sponsor DECLARES one of seven classes, the
 * Annex VIII rules YIELD one of four, and Is/Im/Ir are a Class I device with
 * one further aspect rather than rule outcomes.
 */
import { describe, expect, it } from 'vitest';

import { DEVICE_CLASSES } from '../../constants/domain/device-classification.js';
import {
  euDeviceClassOf,
  IVDR_CLASSES,
  MDR_DECLARED_CLASSES,
  MDR_RULE_CLASSES,
  mdrClassINeedsNotifiedBody,
  mdrRuleClassOf,
} from '../device-class.js';

describe('the two MDR shapes', () => {
  it('are seven declared and four the rules yield', () => {
    expect(MDR_DECLARED_CLASSES).toEqual(['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III']);
    expect(MDR_RULE_CLASSES).toEqual(['I', 'IIa', 'IIb', 'III']);
  });

  it('agree: every class a rule yields is one a sponsor can declare', () => {
    const unsayable = MDR_RULE_CLASSES.filter(c => !(MDR_DECLARED_CLASSES as readonly string[]).includes(c));
    expect(unsayable, 'a rule outcome nobody could declare').toEqual([]);
  });

  it('relate the three that are not rule outcomes to the class they are', () => {
    for (const declared of ['Is', 'Im', 'Ir'] as const) {
      expect(mdrRuleClassOf(declared), declared).toBe('I');
      expect(mdrClassINeedsNotifiedBody(declared), declared).toBe(true);
    }
    for (const declared of ['I', 'IIa', 'IIb', 'III'] as const) {
      expect(mdrRuleClassOf(declared), declared).toBe(declared);
      expect(mdrClassINeedsNotifiedBody(declared), declared).toBe(false);
    }
  });
});

describe('the IVDR and US vocabularies', () => {
  it('are one list each, and the US one is the taxonomy that already governs it', () => {
    expect(IVDR_CLASSES).toEqual(['A', 'B', 'C', 'D']);
    expect(DEVICE_CLASSES, 're-exported, not restated').toEqual(['I', 'II', 'III']);
  });
});

describe('reading a class as someone else wrote it', () => {
  it('takes the spellings a person or another system uses', () => {
    expect(euDeviceClassOf('IIa')).toBe('IIa');
    expect(euDeviceClassOf('iia')).toBe('IIa');
    expect(euDeviceClassOf('Class IIb')).toBe('IIb');
    expect(euDeviceClassOf('class_iii')).toBe('III');
    expect(euDeviceClassOf('Class D')).toBe('D');
    expect(euDeviceClassOf(' d ')).toBe('D');
    expect(euDeviceClassOf('Is')).toBe('Is');
  });

  it('reads nothing as nothing, rather than as a class', () => {
    for (const value of ['', '  ', 'Class', 'IV', 'E', 'II', '2', 'class_ii']) {
      expect(euDeviceClassOf(value), JSON.stringify(value)).toBeNull();
    }
    expect(euDeviceClassOf(null)).toBeNull();
    expect(euDeviceClassOf(undefined)).toBeNull();
  });
});
