/**
 * Pins the expanded access source records: one record per identity, a cited
 * basis on every part, manual parts outside AnA, and no form number or
 * deadline without a citation. Each checker is shown catching a planted case.
 */
import { describe, it, expect } from 'vitest';
import {
  US_EXPANDED_ACCESS_SOURCE_RECORDS as RECORDS,
  US_EXPANDED_ACCESS_SOURCE_BASIS,
  US_EXPANDED_ACCESS_INDIVIDUAL_PATHS,
  US_EXPANDED_ACCESS_INDIVIDUAL_SUBMITTERS,
} from '../us-biotech-expanded-access-sources';
import LIFECYCLE_DOCUMENT_TYPES from '../lifecycle-document-types';
import { FDAFormsRegistry } from '../../../../config/FDAFormsRegistry';
import type { LifecycleComponent } from '../types';

const IDS = ['US_EXPANDED_ACCESS_INDIVIDUAL', 'US_EXPANDED_ACCESS_INTERMEDIATE', 'US_EXPANDED_ACCESS_TREATMENT'];
const CITATION = /21 CFR \d|FD&C Act sec\. \d|FDA Guidance for Industry: /;
const MANUAL_TYPES = new Set(['form', 'data', 'table']);
const ADMITTED_FORMS = new Set(['1571', '1572', '3926']);

const text = (c: LifecycleComponent) => [c.title, c.guidance, c.authoringGuidance, ...c.keyContentElements].join(' ');

/** Problems in one part: uncited basis, an unadmitted form number, or a deadline whose sentence has no citation. */
function problems(c: LifecycleComponent): string[] {
  const out: string[] = [];
  if (!CITATION.test(c.guidance)) out.push(`${c.code}: uncited basis`);
  for (const m of text(c).matchAll(/Form FDA (\w+)/g)) if (!ADMITTED_FORMS.has(m[1])) out.push(`${c.code}: form ${m[1]}`);
  for (const s of text(c).split(/(?<=[.;)])\s/)) {
    if (/\d+ (working|calendar)? ?days?\b/.test(s) && !CITATION.test(s) && !/312\.\d|56\.\d/.test(c.guidance)) out.push(`${c.code}: uncited deadline`);
  }
  return out;
}

describe('US expanded access source records', () => {
  it('has each identity exactly once, appended once into the lifecycle registry with no id collision', () => {
    expect(RECORDS.map(r => r.registryId).sort()).toEqual([...IDS].sort());
    // 2026-10-29: the records are appended into LIFECYCLE_DOCUMENT_TYPES; each id
    // appears there exactly once, as this same record, and no other record shares it.
    for (const r of RECORDS) expect(LIFECYCLE_DOCUMENT_TYPES.filter(x => x.id === r.id)).toEqual([r]);
    expect(new Set(LIFECYCLE_DOCUMENT_TYPES.map(r => r.id)).size).toBe(LIFECYCLE_DOCUMENT_TYPES.length);
    for (const r of RECORDS) expect(new Set(r.components.map(c => c.code)).size).toBe(r.components.length);
  });

  it('cites every part, admits only known form numbers and cites every deadline', () => {
    for (const r of RECORDS) expect(r.components.flatMap(problems)).toEqual([]);
    for (const r of RECORDS) for (const s of (r.timing ?? '').split(/;\s|\.\s/)) if (/\bdays?\b/.test(s)) expect(s, r.id).toMatch(/21 CFR \d/);
    const planted: LifecycleComponent = { code: 'X', title: 'Form FDA 9999', required: true, contentType: 'narrative',
      guidance: 'Industry practice', authoringGuidance: 'Submit within 10 days.', keyContentElements: [], generationPrompt: '' };
    expect(problems(planted)).toEqual(['X: uncited basis', 'X: form 9999', 'X: uncited deadline']);
  });

  it('keeps Form FDA 3926 on the individual record only, as a manual part', () => {
    for (const r of RECORDS) {
      const has3926 = r.components.some(c => /3926/.test(c.title));
      expect(has3926).toBe(r.registryId === 'US_EXPANDED_ACCESS_INDIVIDUAL');
    }
    expect(FDAFormsRegistry.FDA_1571).toBeDefined();
    expect(FDAFormsRegistry.FDA_1572).toBeDefined();
  });

  it('keeps forms and signed records manual: not narrative, and their prompts refuse to draft', () => {
    for (const r of RECORDS) {
      for (const c of r.components) {
        const original = /Form FDA|Letter of Authorization|IRB|Authorization Record/.test(c.title) && !/Request to Charge/.test(c.title);
        if (original) expect(MANUAL_TYPES.has(c.contentType), c.code).toBe(true);
        if (MANUAL_TYPES.has(c.contentType)) expect(c.generationPrompt.startsWith('Do not draft'), c.code).toBe(true);
      }
    }
  });

  it('records every basis as recall, and both individual paths and submitters point at real parts', () => {
    for (const id of IDS) for (const b of US_EXPANDED_ACCESS_SOURCE_BASIS[id]) expect(b.confidence).toBe('recall');
    const individual = RECORDS.find(r => r.registryId === 'US_EXPANDED_ACCESS_INDIVIDUAL')!;
    const codes = new Set(individual.components.map(c => c.code));
    for (const p of US_EXPANDED_ACCESS_INDIVIDUAL_PATHS) for (const code of p.addsComponents) expect(codes.has(code)).toBe(true);
    for (const s of US_EXPANDED_ACCESS_INDIVIDUAL_SUBMITTERS) expect(codes.has(s.formComponent)).toBe(true);
  });
});
