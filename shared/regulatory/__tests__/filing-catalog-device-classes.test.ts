import { describe, expect, it } from 'vitest';
import { deviceClassScopeForFiling } from '../filing-catalog';
import { GLOBAL_REGISTRY } from '../global-document-registry';

describe('class-specific filing scopes project canonical registry identity and existing vocabularies', () => {
  it.each([
    { id: 'EU_MDR_CLASS_I', regulation: 'mdr', classes: ['I', 'Is', 'Im', 'Ir'] },
    { id: 'eu_mdr_class_iia', regulation: 'mdr', classes: ['IIa'] },
    { id: 'eu_mdr_iib', regulation: 'mdr', classes: ['IIb'] },
    { id: 'eu_mdr_iii', regulation: 'mdr', classes: ['III'] },
    { id: 'EU_IVDR_CLASS_A', regulation: 'ivdr', classes: ['A'] },
    { id: 'eu_ivdr_b', regulation: 'ivdr', classes: ['B'] },
    { id: 'eu_ivdr_cd', regulation: 'ivdr', classes: ['C', 'D'] },
  ])('$id exposes only its recorded class scope', ({ id, regulation, classes }) => {
    expect(deviceClassScopeForFiling(id)).toEqual({ regulation, classes });
  });

  it.each(['EU_MDR_TECHDOC', 'EU_IVDR', 'EU_CER', 'EU_CDX_IVDR_D', 'US_510K', 'unknown', null])('%s does not invent a class-specific scope', id => {
    expect(deviceClassScopeForFiling(id)).toBeNull();
  });

  it('an exact parent class constrains a descendant without a copied classification map', () => {
    const entry = GLOBAL_REGISTRY.find(row => row.id === 'EU_MDR_TECHDOC')!;
    const original = entry.parentApplicationType;
    try {
      entry.parentApplicationType = 'EU_MDR_CLASS_III';
      expect(deviceClassScopeForFiling(entry.id)).toEqual({ regulation: 'mdr', classes: ['III'] });
    } finally { entry.parentApplicationType = original; }
  });

  it('a malformed cyclic parent does not loop or invent a scope', () => {
    const entry = GLOBAL_REGISTRY.find(row => row.id === 'EU_MDR_TECHDOC')!;
    const original = entry.parentApplicationType;
    try { entry.parentApplicationType = entry.id; expect(deviceClassScopeForFiling(entry.id)).toBeNull(); }
    finally { entry.parentApplicationType = original; }
  });
});
