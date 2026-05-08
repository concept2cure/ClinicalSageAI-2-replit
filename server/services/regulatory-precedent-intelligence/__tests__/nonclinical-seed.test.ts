/**
 * Shape and content tests for the nonclinical RTF seed array.
 * These run without a live database — they validate that every seed
 * matches the runtime contract `rtfTriggerService.createPattern` expects.
 */

import { describe, it, expect } from 'vitest';
import {
  NONCLINICAL_RTF_PATTERNS,
  type NonclinicalRtfSeed,
} from '../seeds/nonclinical-rtf-patterns';

const REQUIRED_CODES = [
  'NC_GLP_PIVOTAL_MISSING',
  'NC_SPECIES_COVERAGE',
  'NC_GENOTOX_BATTERY_INCOMPLETE',
  'NC_NOAEL_MARGIN_INSUFFICIENT',
  'NC_REPRO_TOX_STAGE_MISMATCH',
  'NC_CARC_REQUIRED_MISSING',
  'NC_TK_DATA_MISSING',
] as const;

describe('Nonclinical RTF seed patterns', () => {
  it('contains the seven required patterns', () => {
    const codes = NONCLINICAL_RTF_PATTERNS.map(p => p.patternCode).sort();
    expect(codes).toEqual([...REQUIRED_CODES].sort());
  });

  it('uses the nonclinical_data category for every entry', () => {
    for (const p of NONCLINICAL_RTF_PATTERNS) {
      expect(p.category).toBe('nonclinical_data');
    }
  });

  it('applies a recognised preventability label', () => {
    const allowed = new Set([
      'highly_preventable',
      'preventable',
      'partially_preventable',
      'difficult',
    ]);
    for (const p of NONCLINICAL_RTF_PATTERNS) {
      expect(allowed.has(p.preventability)).toBe(true);
    }
  });

  it('attaches at least one recovery step per pattern', () => {
    for (const p of NONCLINICAL_RTF_PATTERNS) {
      expect(p.recoverySteps.length).toBeGreaterThan(0);
      for (const step of p.recoverySteps) {
        expect(step.action.length).toBeGreaterThan(0);
        expect(step.timelineDays).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('declares submission types and applicable centers', () => {
    for (const p of NONCLINICAL_RTF_PATTERNS) {
      expect(p.submissionTypes.length).toBeGreaterThan(0);
      expect(p.applicableCenters.length).toBeGreaterThan(0);
    }
  });

  it('uses a unique patternCode per entry', () => {
    const codes = NONCLINICAL_RTF_PATTERNS.map(p => p.patternCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps frequencyRate in the [0, 1] range', () => {
    for (const p of NONCLINICAL_RTF_PATTERNS) {
      expect(p.frequencyRate).toBeGreaterThanOrEqual(0);
      expect(p.frequencyRate).toBeLessThanOrEqual(1);
    }
  });
});

// Type-level guard: keep the seed array assignable to NonclinicalRtfSeed[].
const _typeCheck: NonclinicalRtfSeed[] = NONCLINICAL_RTF_PATTERNS;
void _typeCheck;
