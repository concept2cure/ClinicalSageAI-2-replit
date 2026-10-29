/**
 * Type D and INTERACT lifecycle sources, built from the existing meeting core.
 * Pins: one record per id, a cited basis on every part, the attendee list
 * manual, and no form number or day count without a citation beside it.
 */
import { describe, it, expect } from 'vitest';
import {
  FDA_FORMAL_MEETINGS_GUIDANCE, FDA_FORMAL_MEETING_TIMELINES, FDA_MEETING_PACKAGE_CORE,
  meetingPackageDeadline, meetingTypeName, type FdaMeetingType,
} from '../lifecycle-document-types';
import { buildUsBiotechMeetingSources, US_BIOTECH_MEETING_SOURCE_IDS } from '../us-biotech-meetings-sources';

// lifecycle-document-types.ts keeps meetingTiming private; same composition from the same table.
const meetingTiming = (type: FdaMeetingType, when: string) =>
  `${when}; FDA schedules a ${meetingTypeName(type)} meeting within ${FDA_FORMAL_MEETING_TIMELINES[type].scheduleDays} days of receipt of the meeting request, with the briefing document (meeting package) due ${meetingPackageDeadline(type)}.`;

const records = buildUsBiotechMeetingSources({
  guidance: FDA_FORMAL_MEETINGS_GUIDANCE, timelines: FDA_FORMAL_MEETING_TIMELINES, packageCore: FDA_MEETING_PACKAGE_CORE,
  meetingTypeName, meetingPackageDeadline, meetingTiming,
});
const CITED = /21 CFR|PDUFA|guidance|recall/i;
const MANUAL_TYPES = new Set(['form', 'data', 'table']);

describe('US biotech meeting sources (Type D, INTERACT)', () => {
  it('has each lifecycle and registry id once, with the timeline figures from the core', () => {
    const want = Object.values(US_BIOTECH_MEETING_SOURCE_IDS);
    expect(records.map(r => r.id)).toEqual(want.map(w => w.id));
    expect(records.map(r => r.registryId)).toEqual(want.map(w => w.registryId));
    expect(records[0].timing).toContain('within 50 days');
    expect(records[1].timing).toContain('within 75 days');
    for (const r of records) {
      expect(r.category).toBe('meeting');
      expect(r.regulatoryBasis.length).toBeGreaterThan(0);
      expect(r.regulatoryBasis.every(b => CITED.test(b))).toBe(true);
      expect(new Set(r.components.map(c => c.code)).size).toBe(r.components.length);
      for (const core of FDA_MEETING_PACKAGE_CORE) {
        expect(r.components.find(c => c.code === core.code)?.title).toBe(core.title);
      }
    }
  });

  it('cites a basis on every part and keeps the attendee roster manual', () => {
    for (const c of records.flatMap(r => r.components)) {
      expect(c.guidance, c.code).toMatch(/Basis: .*\((recall|regulator-text|platform-convention)\)/);
      expect(MANUAL_TYPES.has(c.contentType), c.code).toBe(c.code === 'MTG-ATTEND');
    }
  });

  it('states no form number, and no day count without a citation in the same text', () => {
    const texts = records.flatMap(r => [r.description, r.timing ?? '', ...r.components.flatMap(c =>
      [c.guidance, c.authoringGuidance, c.generationPrompt, ...c.keyContentElements])]);
    expect(texts.filter(t => /\bForm\s*(FDA\s*)?\d{3,4}|\bFDA\s*\d{4}\b/i.test(t))).toEqual([]);
    const timings = records.map(r => r.timing ?? '');
    expect(texts.filter(t => /\b\d+\s+(calendar\s+)?days\b/.test(t) && !CITED.test(t) && !timings.includes(t))).toEqual([]);
  });

  it('refuses to build when the core loses a part', () => {
    expect(() => buildUsBiotechMeetingSources({
      guidance: FDA_FORMAL_MEETINGS_GUIDANCE, timelines: FDA_FORMAL_MEETING_TIMELINES,
      packageCore: FDA_MEETING_PACKAGE_CORE.filter(c => c.code !== 'MTG-QUES'),
      meetingTypeName, meetingPackageDeadline, meetingTiming,
    })).toThrow(/MTG-QUES/);
  });
});
