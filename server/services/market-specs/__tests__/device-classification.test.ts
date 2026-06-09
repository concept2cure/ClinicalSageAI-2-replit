/**
 * Tests for the device classification engine — proves the MDR/IVDR principal-rule
 * determinations (highest applicable class) and the FDA pathway heuristic.
 */
import { describe, it, expect } from 'vitest';
import { classifyMdr, classifyIvdr, recommendFdaPathway } from '../device-classification';

describe('MDR classification (Annex VIII principal rules)', () => {
  it('a non-invasive device is Class I', () => {
    const r = classifyMdr({ invasive: false });
    expect(r.class).toBe('I');
    expect(r.ruleApplied).toMatch(/Rule 1/);
  });

  it('a transient surgically invasive device is IIa, short-term IIb', () => {
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'transient' }).class).toBe('IIa');
    expect(classifyMdr({ surgicallyInvasive: true, duration: 'short_term' }).class).toBe('IIb');
  });

  it('an implantable device is at least IIb', () => {
    expect(classifyMdr({ implantable: true }).class).toBe('IIb');
  });

  it('an implantable device contacting the CNS/central circulation is III', () => {
    const r = classifyMdr({ implantable: true, contactsCnsOrCentralCirculation: true });
    expect(r.class).toBe('III');
    expect(r.ruleApplied).toMatch(/Rule 8/);
  });

  it('a device incorporating a medicinal substance is III (Rule 14)', () => {
    expect(classifyMdr({ invasive: false, incorporatesMedicinalSubstance: true }).class).toBe('III');
  });

  it('takes the HIGHEST applicable class', () => {
    // active therapeutic (IIa) + implantable (IIb) → IIb
    expect(classifyMdr({ activeTherapeutic: true, implantable: true }).class).toBe('IIb');
  });

  it('software decision support is IIa, serious-decision software is III', () => {
    expect(classifyMdr({ softwareDecisionSupport: true }).class).toBe('IIa');
    expect(classifyMdr({ softwareDecisionSupport: true, softwareSeriousDecisions: true }).class).toBe('III');
  });
});

describe('IVDR classification (Annex VIII principal rules)', () => {
  it('blood-donation screening is Class D', () => {
    expect(classifyIvdr({ bloodDonationScreening: true }).class).toBe('D');
  });
  it('a companion diagnostic is Class C', () => {
    expect(classifyIvdr({ companionDiagnostic: true }).class).toBe('C');
  });
  it('self-testing is Class B', () => {
    expect(classifyIvdr({ selfTesting: true }).class).toBe('B');
  });
  it('a general lab reagent/instrument is Class A', () => {
    expect(classifyIvdr({ generalLabOrInstrumentOrReceptacle: true }).class).toBe('A');
  });
  it('defaults to Class B (Rule 6) when no specific rule applies', () => {
    expect(classifyIvdr({}).class).toBe('B');
  });
  it('takes the highest class (infectious + self-test → C)', () => {
    expect(classifyIvdr({ infectiousOrCancerOrGenetic: true, selfTesting: true }).class).toBe('C');
  });
});

describe('FDA pathway recommendation (heuristic)', () => {
  it('exempt device → exempt', () => {
    expect(recommendFdaPathway({ exempt: true }).pathway).toBe('exempt');
  });
  it('Class III → PMA', () => {
    expect(recommendFdaPathway({ fdaClass: 'III' }).pathway).toBe('pma');
  });
  it('predicate available → 510(k)', () => {
    expect(recommendFdaPathway({ fdaClass: 'II', predicateAvailable: true }).pathway).toBe('510k');
  });
  it('novel low-to-moderate risk, no predicate → De Novo', () => {
    expect(recommendFdaPathway({ novelLowModerateRisk: true }).pathway).toBe('de_novo');
  });
  it('no predicate and risk unestablished → PMA (conservative default)', () => {
    expect(recommendFdaPathway({}).pathway).toBe('pma');
  });
  it('every recommendation carries a confirm caveat', () => {
    expect(recommendFdaPathway({ exempt: true }).caveat).toMatch(/classification/i);
  });
});
