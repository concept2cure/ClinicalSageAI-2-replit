/**
 * Tool determinism-pedigree classifier — verifies the conservative classification
 * rules that let AnA weight tool outputs by trustworthiness. Pure classifier, so the
 * suite is hermetic (no mocks, no IO).
 */

import { describe, it, expect } from 'vitest';
import { GLOBAL_RI_TOOL_NAMES } from '../../global-ri/ana-tools';
import {
  PEDIGREE_LEVELS,
  DETERMINISTIC_REGISTRY_EXTRA,
  getToolPedigree,
  classifyTools,
  listDeterministicTools,
  type DeterminismPedigree,
} from '../tool-pedigree';

describe('getToolPedigree — global-RI tools', () => {
  it('classifies every global-RI tool as deterministic_registry / high trust', () => {
    expect(GLOBAL_RI_TOOL_NAMES.length).toBeGreaterThan(0);
    for (const name of GLOBAL_RI_TOOL_NAMES) {
      const info = getToolPedigree(name);
      expect(info.tool).toBe(name);
      expect(info.pedigree).toBe('deterministic_registry');
      expect(info.deterministic).toBe(true);
      expect(info.trust).toBe('high');
    }
  });
});

describe('getToolPedigree — name-prefix heuristic', () => {
  it("classifies 'search_' tools as external_api_live (non-deterministic, medium trust)", () => {
    const info = getToolPedigree('search_clinical_evidence');
    expect(info.pedigree).toBe('external_api_live');
    expect(info.deterministic).toBe(false);
    expect(info.trust).toBe('medium');
  });

  it("classifies advise_/unknown tools as model_assisted (requires_verification)", () => {
    for (const name of ['advise_study_design', 'totally_made_up_tool']) {
      const info = getToolPedigree(name);
      expect(info.pedigree).toBe('model_assisted');
      expect(info.deterministic).toBe(false);
      expect(info.trust).toBe('requires_verification');
    }
  });
});

describe('PEDIGREE_LEVELS', () => {
  it('has all four keys, each self-consistent with non-empty guidance', () => {
    const keys: DeterminismPedigree[] = [
      'deterministic_registry',
      'deterministic_query',
      'external_api_live',
      'model_assisted',
    ];
    expect(Object.keys(PEDIGREE_LEVELS).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const info = PEDIGREE_LEVELS[key];
      expect(info.pedigree).toBe(key);
      expect(info.guidance.length).toBeGreaterThan(0);
    }
    expect(PEDIGREE_LEVELS.deterministic_registry.deterministic).toBe(true);
    expect(PEDIGREE_LEVELS.deterministic_query.deterministic).toBe(true);
    expect(PEDIGREE_LEVELS.external_api_live.deterministic).toBe(false);
    expect(PEDIGREE_LEVELS.model_assisted.deterministic).toBe(false);
    expect(PEDIGREE_LEVELS.model_assisted.trust).toBe('requires_verification');
  });
});

describe('classifyTools', () => {
  it('returns one entry per input, preserving order', () => {
    const input = ['search_clinical_evidence', GLOBAL_RI_TOOL_NAMES[0], 'advise_study_design'];
    const out = classifyTools(input);
    expect(out.map((o) => o.tool)).toEqual(input);
    expect(out[0].pedigree).toBe('external_api_live');
    expect(out[1].pedigree).toBe('deterministic_registry');
    expect(out[2].pedigree).toBe('model_assisted');
  });

  it('handles an empty list', () => {
    expect(classifyTools([])).toEqual([]);
  });
});

describe('listDeterministicTools', () => {
  it('includes every global-RI name and is sorted', () => {
    const list = listDeterministicTools();
    for (const name of GLOBAL_RI_TOOL_NAMES) {
      expect(list).toContain(name);
    }
    expect(list).toEqual([...list].sort());
    // global-ri + (empty) extras, de-duplicated
    const expectedSize = new Set([...GLOBAL_RI_TOOL_NAMES, ...DETERMINISTIC_REGISTRY_EXTRA]).size;
    expect(list.length).toBe(expectedSize);
  });
});

describe('determinism', () => {
  it('returns equal results for the same input twice', () => {
    for (const name of ['search_clinical_evidence', 'advise_study_design', GLOBAL_RI_TOOL_NAMES[0]]) {
      expect(getToolPedigree(name)).toEqual(getToolPedigree(name));
    }
  });
});
