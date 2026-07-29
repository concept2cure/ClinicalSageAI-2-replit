/**
 * Regulatory guidance map — topic → ICH guidelines (resolved) + regulations.
 */

import { describe, it, expect } from 'vitest';
import { getGuidanceFor, listGuidanceTopics } from '../regulatory-guidance-map';
import { getGuideline } from '../ich-guideline-catalog';

describe('getGuidanceFor', () => {
  it('grounds the CSR topic in ICH E3', () => {
    const g = getGuidanceFor('clinical_study_report');
    expect(g.found).toBe(true);
    expect(g.ichGuidelines.map((x) => x.code)).toContain('E3');
    expect(g.ichGuidelines.find((x) => x.code === 'E3')?.title).toBeTruthy();
  });

  it('grounds stability in Q1 and GCP in E6', () => {
    expect(getGuidanceFor('stability').ichGuidelines.map((x) => x.code)).toContain('Q1');
    expect(getGuidanceFor('good_clinical_practice').ichGuidelines.map((x) => x.code)).toContain('E6');
  });

  it('grounds expedited safety reporting in E2A + 21 CFR 312.32', () => {
    const g = getGuidanceFor('expedited_safety_reporting');
    expect(g.ichGuidelines.map((x) => x.code)).toContain('E2A');
    expect(g.regulations.some((r) => r.includes('312.32'))).toBe(true);
  });

  it('is case-insensitive on the topic key', () => {
    expect(getGuidanceFor('STABILITY').found).toBe(true);
  });

  it('returns found:false for an unmodeled topic', () => {
    const g = getGuidanceFor('not_a_topic');
    expect(g.found).toBe(false);
    expect(g.ichGuidelines).toEqual([]);
  });

  it('resolves every referenced ICH code to a real catalog title (no drift)', () => {
    for (const topic of listGuidanceTopics()) {
      for (const ref of getGuidanceFor(topic).ichGuidelines) {
        expect(getGuideline(ref.code), `topic ${topic} references unknown ICH code ${ref.code}`).toBeTruthy();
        expect(ref.title).toBeTruthy();
      }
    }
  });

  it('is deterministic', () => {
    expect(getGuidanceFor('impurities')).toEqual(getGuidanceFor('impurities'));
  });
});

describe('listGuidanceTopics', () => {
  it('returns a sorted, non-empty topic list', () => {
    const topics = listGuidanceTopics();
    expect(topics.length).toBeGreaterThan(10);
    expect([...topics]).toEqual([...topics].sort());
  });
});
