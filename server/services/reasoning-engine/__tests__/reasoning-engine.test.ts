/**
 * Reasoning Engine (WO-5) — deterministic resolution behind the swappable
 * `resolve()` contract. The WO-5 gate: an FDA IND and an EU MAA must differ
 * correctly in Module 1 + forms + review clock; CTD dependencies resolve; the
 * engine is deterministic and falls back past the (disabled) HRM resolver.
 */

import { describe, it, expect } from 'vitest';
import {
  resolve,
  resolverFor,
  rulesResolver,
  hrmResolver,
  HRM_ENABLED,
  type RequiredSection,
  type ReviewClock,
} from '../index';

describe('reasoning-engine — resolver wiring', () => {
  it('the HRM resolver is disabled and the rules resolver is the floor', () => {
    expect(HRM_ENABLED).toBe(false);
    expect(hrmResolver.supports({ task: 'review-clock', region: 'fda', applicationType: 'nda' })).toBe(false);
    expect(resolverFor({ task: 'review-clock', region: 'fda', applicationType: 'nda' })).toBe('rules');
  });

  it('is deterministic (same input → identical output)', () => {
    const a = resolve({ task: 'required-sections', region: 'fda', applicationType: 'ind' });
    const b = resolve({ task: 'required-sections', region: 'fda', applicationType: 'ind' });
    expect(a).toEqual(b);
    expect(a.resolver).toBe('rules');
    expect(a.profileVersion).toBeTruthy();
  });

  it('throws when no resolver supports the task', () => {
    // @ts-expect-error — deliberately invalid task
    expect(() => resolve({ task: 'nonsense', region: 'fda', applicationType: 'nda' })).toThrow();
  });
});

describe('reasoning-engine — WO-5 gate: FDA IND vs EU MAA differ', () => {
  const indSections = resolve<RequiredSection[]>({ task: 'required-sections', region: 'fda', applicationType: 'ind' }).data;
  const maaSections = resolve<RequiredSection[]>({ task: 'required-sections', region: 'eu', applicationType: 'maa' }).data;

  it('Module 1 forms differ by region', () => {
    const fdaForm = indSections.find(s => s.module === 1 && /1571|356h|forms/i.test(s.title));
    const euForm = maaSections.find(s => s.module === 1 && /application form/i.test(s.title));
    expect(fdaForm).toBeTruthy();
    expect(euForm).toBeTruthy();
    expect(fdaForm!.title).toMatch(/1571/);
    // EU requires an RMP in Module 1; FDA IND Module 1 does not.
    expect(maaSections.some(s => /risk management plan/i.test(s.title))).toBe(true);
    expect(indSections.some(s => /risk management plan/i.test(s.title))).toBe(false);
  });

  it('clinical summaries are required for a marketing app but not an IND', () => {
    const indClinSummary = indSections.find(s => s.sectionCode === '2.7');
    const maaClinSummary = maaSections.find(s => s.sectionCode === '2.7');
    expect(indClinSummary!.required).toBe(false);
    expect(maaClinSummary!.required).toBe(true);
  });

  it('review clocks differ correctly', () => {
    const ind = resolve<ReviewClock>({ task: 'review-clock', region: 'fda', applicationType: 'ind' }).data;
    const nda = resolve<ReviewClock>({ task: 'review-clock', region: 'fda', applicationType: 'nda' }).data;
    const maa = resolve<ReviewClock>({ task: 'review-clock', region: 'eu', applicationType: 'maa' }).data;
    expect(ind.nominalDays).toBe(30);
    expect(nda.model).toBe('PDUFA');
    expect(maa.model).toBe('EU centralised');
    expect(maa.nominalDays).toBe(210);
    expect(maa.clockStops).toBe(true);
  });
});

describe('reasoning-engine — CTD dependencies & granularity', () => {
  it('2.5 Clinical Overview depends on Modules 4 and 5', () => {
    const deps = resolve<string[]>({ task: 'ctd-dependencies', region: 'fda', applicationType: 'nda', sectionCode: '2.5' }).data;
    expect(deps).toEqual(expect.arrayContaining(['4', '5']));
  });

  it('2.3 QOS depends on Module 3; a leaf section has no prerequisites', () => {
    expect(resolve<string[]>({ task: 'ctd-dependencies', region: 'fda', applicationType: 'nda', sectionCode: '2.3' }).data).toEqual(['3']);
    expect(resolve<string[]>({ task: 'ctd-dependencies', region: 'fda', applicationType: 'nda', sectionCode: '3' }).data).toEqual([]);
  });

  it('requires a sectionCode for dependency/granularity tasks', () => {
    expect(() => resolve({ task: 'ctd-dependencies', region: 'fda', applicationType: 'nda' })).toThrow(/sectionCode/);
    expect(() => resolve({ task: 'granularity', region: 'fda', applicationType: 'nda' })).toThrow(/sectionCode/);
  });

  it('granularity resolves for a known section', () => {
    const g = resolve<string>({ task: 'granularity', region: 'fda', applicationType: 'nda', sectionCode: '5' }).data;
    expect(g).toBe('one-per-study');
  });
});
