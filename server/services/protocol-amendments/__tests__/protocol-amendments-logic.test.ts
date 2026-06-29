/**
 * Protocol Amendments pure logic — impact classification + submission readiness.
 * Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyAmendmentImpact,
  evaluateAmendmentReadiness,
} from '../protocol-amendments-logic';

describe('classifyAmendmentImpact', () => {
  it('routes a minor change to expedited review with no re-consent (cited)', () => {
    const r = classifyAmendmentImpact({ amendmentType: 'minor', affectsConsent: false, affectsRisk: false });
    expect(r.reviewPath).toBe('expedited');
    expect(r.requiresReconsent).toBe(false);
    expect(r.basis).toMatch(/46\.110|56\.110/);
  });

  it('routes a major change to full review (cited)', () => {
    const r = classifyAmendmentImpact({ amendmentType: 'major', affectsConsent: false, affectsRisk: false });
    expect(r.reviewPath).toBe('full');
    expect(r.requiresReconsent).toBe(false);
    expect(r.basis).toMatch(/46\.109|46\.116/);
  });

  it('escalates a minor change that affects consent to full review + re-consent', () => {
    const r = classifyAmendmentImpact({ amendmentType: 'minor', affectsConsent: true, affectsRisk: false });
    expect(r.reviewPath).toBe('full');
    expect(r.requiresReconsent).toBe(true);
  });

  it('escalates an administrative change that affects risk to full review + re-consent', () => {
    const r = classifyAmendmentImpact({ amendmentType: 'administrative', affectsConsent: false, affectsRisk: true });
    expect(r.reviewPath).toBe('full');
    expect(r.requiresReconsent).toBe(true);
  });

  it('routes a pure administrative change to the administrative path', () => {
    const r = classifyAmendmentImpact({ amendmentType: 'administrative', affectsConsent: false, affectsRisk: false });
    expect(r.reviewPath).toBe('administrative');
    expect(r.requiresReconsent).toBe(false);
    expect(r.basis).toBeTruthy();
  });

  it('requires re-consent whenever consent or risk is affected', () => {
    expect(classifyAmendmentImpact({ amendmentType: 'major', affectsConsent: true, affectsRisk: false }).requiresReconsent).toBe(true);
    expect(classifyAmendmentImpact({ amendmentType: 'major', affectsConsent: false, affectsRisk: true }).requiresReconsent).toBe(true);
  });
});

describe('evaluateAmendmentReadiness', () => {
  it('is ready when draft with at least one change', () => {
    const r = evaluateAmendmentReadiness({ status: 'draft', changeCount: 1 });
    expect(r.readyToSubmit).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks a draft with no changes', () => {
    const r = evaluateAmendmentReadiness({ status: 'draft', changeCount: 0 });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.some((b) => /no change/i.test(b))).toBe(true);
  });

  it('blocks a non-draft amendment', () => {
    const r = evaluateAmendmentReadiness({ status: 'submitted', changeCount: 3 });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.some((b) => /only a draft/i.test(b))).toBe(true);
  });

  it('reports both blockers for a non-draft with no changes', () => {
    const r = evaluateAmendmentReadiness({ status: 'rejected', changeCount: 0 });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.length).toBe(2);
  });
});
