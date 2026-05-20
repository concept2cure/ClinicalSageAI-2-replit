/**
 * Unit tests for the SUPAC / variations classifier.
 *
 * The classifier is a regulatory gate — a wrong tier or wrong reporting
 * category can route a post-approval change down the wrong pathway. Every
 * branch is covered.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyVariation,
  type VariationInput,
} from '../server/services/cmc/supac-classifier';

function variation(overrides: Partial<VariationInput> = {}): VariationInput {
  return {
    dosageFormFamily: 'immediate_release_oral_solid',
    changeCategory: 'manufacturing_process',
    affects: 'drug_product',
    ...overrides,
  };
}

describe('SUPAC / variations classifier', () => {
  describe('FDA reporting category', () => {
    it('classifies scale-up >10x as PAS with SUPAC level 3', () => {
      const r = classifyVariation(variation({
        changeCategory: 'scale_up',
        scaleChangeFactor: 'gt_10x',
      }));
      expect(r.fdaReportingCategory).toBe('pas');
      expect(r.supacTier).toBe('level_3');
      expect(r.rationale.some(s => s.includes('beyond 10×'))).toBe(true);
      expect(r.citations).toContain('SUPAC-IR §V.B.3 (Level 3 scale-up)');
    });

    it('classifies scale-up within 10x as Annual Report SUPAC level 2', () => {
      const r = classifyVariation(variation({
        changeCategory: 'scale_up',
        scaleChangeFactor: 'within_10x',
      }));
      expect(r.fdaReportingCategory).toBe('annual_report');
      expect(r.supacTier).toBe('level_2');
    });

    it('classifies Level 3 excipient change as PAS', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_3',
      }));
      expect(r.fdaReportingCategory).toBe('pas');
      expect(r.supacTier).toBe('level_3');
    });

    it('classifies Level 2 excipient change as CBE-30', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_2',
      }));
      expect(r.fdaReportingCategory).toBe('cbe_30');
      expect(r.supacTier).toBe('level_2');
    });

    it('classifies Level 1 excipient change as Annual Report', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_1',
      }));
      expect(r.fdaReportingCategory).toBe('annual_report');
      expect(r.supacTier).toBe('level_1');
    });

    it('classifies cross-country site change as PAS', () => {
      const r = classifyVariation(variation({
        changeCategory: 'manufacturing_site',
        siteChangeKind: 'different_country',
      }));
      expect(r.fdaReportingCategory).toBe('pas');
      expect(r.rationale.some(s => s.includes('different country'))).toBe(true);
    });

    it('classifies same-facility site change as Annual Report', () => {
      const r = classifyVariation(variation({
        changeCategory: 'manufacturing_site',
        siteChangeKind: 'within_same_facility',
      }));
      expect(r.fdaReportingCategory).toBe('annual_report');
    });

    it('classifies process principle change as PAS', () => {
      const r = classifyVariation(variation({
        changeCategory: 'manufacturing_process',
        processChangeKind: 'principle_change',
      }));
      expect(r.fdaReportingCategory).toBe('pas');
      expect(r.supacTier).toBe('level_3');
    });

    it('classifies equipment class change as CBE-30', () => {
      const r = classifyVariation(variation({
        changeCategory: 'equipment',
        processChangeKind: 'equipment_class_change',
      }));
      expect(r.fdaReportingCategory).toBe('cbe_30');
      expect(r.supacTier).toBe('level_2');
    });

    it('classifies analytical method change (non-critical) as CBE-30', () => {
      const r = classifyVariation(variation({
        changeCategory: 'analytical_method',
        touchesCriticalStep: false,
      }));
      expect(r.fdaReportingCategory).toBe('cbe_30');
    });

    it('classifies spec tightening (non-critical) as CBE-0', () => {
      const r = classifyVariation(variation({
        changeCategory: 'specifications',
        touchesCriticalStep: false,
      }));
      expect(r.fdaReportingCategory).toBe('cbe_0');
    });

    it('classifies any critical-step manufacturing process change as PAS', () => {
      const r = classifyVariation(variation({
        changeCategory: 'manufacturing_process',
        touchesCriticalStep: true,
      }));
      expect(r.fdaReportingCategory).toBe('pas');
    });
  });

  describe('EMA classification', () => {
    it('returns Type II for principle change', () => {
      const r = classifyVariation(variation({
        changeCategory: 'manufacturing_process',
        processChangeKind: 'principle_change',
      }));
      expect(r.emaVariationCategory).toBe('type_ii');
    });

    it('returns Type IB for site change to different country', () => {
      const r = classifyVariation(variation({
        changeCategory: 'manufacturing_site',
        siteChangeKind: 'different_country',
      }));
      expect(r.emaVariationCategory).toBe('type_ib');
    });

    it('returns Type IA for minor analytical change without critical impact', () => {
      const r = classifyVariation(variation({
        changeCategory: 'analytical_method',
        touchesCriticalStep: false,
      }));
      expect(r.emaVariationCategory).toBe('type_ia');
    });

    it('returns Type IAIN for minor analytical change touching critical step', () => {
      const r = classifyVariation(variation({
        changeCategory: 'analytical_method',
        touchesCriticalStep: true,
      }));
      expect(r.emaVariationCategory).toBe('type_ia_in');
    });
  });

  describe('SUPAC applicability', () => {
    it('returns SUPAC not_applicable for sterile injectables', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'sterile_injectable',
      }));
      expect(r.supacTier).toBe('not_applicable');
    });

    it('returns SUPAC not_applicable for biologics', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'biologic',
      }));
      expect(r.supacTier).toBe('not_applicable');
    });

    it('applies SUPAC-MR citation for modified-release oral solids', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'modified_release_oral_solid',
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_2',
      }));
      expect(r.citations).toContain('FDA SUPAC-MR (September 1997)');
    });

    it('applies SUPAC-SS citation for nonsterile semisolids', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'nonsterile_semisolid',
        changeCategory: 'manufacturing_process',
        processChangeKind: 'equipment_class_change',
      }));
      expect(r.citations).toContain('FDA SUPAC-SS (May 1997)');
    });
  });

  describe('bioequivalence', () => {
    it('requires in vivo BE for Level 3 changes', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_3',
      }));
      expect(r.bioequivalence).toBe('in_vivo_be');
    });

    it('requires in vitro dissolution for Level 2 changes', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_2',
      }));
      expect(r.bioequivalence).toBe('in_vitro_dissolution');
    });

    it('skips BE for biologics', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'biologic',
        changeCategory: 'manufacturing_process',
        processChangeKind: 'equipment_class_change',
      }));
      expect(r.bioequivalence).toBe('none');
    });

    it('skips BE for sterile injectables', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'sterile_injectable',
        changeCategory: 'scale_up',
        scaleChangeFactor: 'gt_10x',
      }));
      expect(r.bioequivalence).toBe('none');
    });
  });

  describe('impacted CTD sections', () => {
    it('routes scale-up changes to 3.2.P.3.x batch/process sections', () => {
      const r = classifyVariation(variation({ changeCategory: 'scale_up' }));
      expect(r.impactedCtdSections).toContain('3.2.P.3.2');
      expect(r.impactedCtdSections).toContain('3.2.P.3.3');
      expect(r.impactedCtdSections).toContain('3.2.P.3.5');
    });

    it('routes container-closure changes to 3.2.P.7 and 3.2.P.8.1', () => {
      const r = classifyVariation(variation({ changeCategory: 'container_closure' }));
      expect(r.impactedCtdSections).toContain('3.2.P.7');
      expect(r.impactedCtdSections).toContain('3.2.P.8.1');
    });

    it('routes analytical method changes to 4.x DS sections when affecting DS', () => {
      const r = classifyVariation(variation({
        changeCategory: 'analytical_method',
        affects: 'drug_substance',
      }));
      expect(r.impactedCtdSections).toContain('3.2.S.4.2');
      expect(r.impactedCtdSections).toContain('3.2.S.4.3');
    });

    it('routes specification changes to both DS and DP sections when affects=both', () => {
      const r = classifyVariation(variation({
        changeCategory: 'specifications',
        affects: 'both',
      }));
      expect(r.impactedCtdSections).toContain('3.2.S.4.1');
      expect(r.impactedCtdSections).toContain('3.2.P.5.1');
    });
  });

  describe('cross-module impact', () => {
    it('always includes Module 2 QOS update', () => {
      const r = classifyVariation(variation());
      const m2 = r.crossModuleImpact.find(c => c.module === 'Module 2');
      expect(m2).toBeDefined();
      expect(m2?.required).toBe(true);
    });

    it('always includes Module 1 administrative update', () => {
      const r = classifyVariation(variation());
      const m1 = r.crossModuleImpact.find(c => c.module === 'Module 1');
      expect(m1).toBeDefined();
      expect(m1?.required).toBe(true);
    });

    it('includes Module 5 BE study reference for oral solid scale-up', () => {
      const r = classifyVariation(variation({
        changeCategory: 'scale_up',
        scaleChangeFactor: 'gt_10x',
      }));
      const m5 = r.crossModuleImpact.find(c => c.module === 'Module 5');
      expect(m5).toBeDefined();
    });

    it('skips Module 5 for biologics (no BE applicable)', () => {
      const r = classifyVariation(variation({
        dosageFormFamily: 'biologic',
        changeCategory: 'scale_up',
      }));
      const m5 = r.crossModuleImpact.find(c => c.module === 'Module 5');
      expect(m5).toBeUndefined();
    });
  });

  describe('validation requirements', () => {
    it('adds process re-validation requirement for scale-up', () => {
      const r = classifyVariation(variation({ changeCategory: 'scale_up' }));
      expect(r.validationRequirements.some(s => s.includes('Process re-validation'))).toBe(true);
    });

    it('adds method comparability for analytical method changes', () => {
      const r = classifyVariation(variation({ changeCategory: 'analytical_method' }));
      expect(r.validationRequirements.some(s => s.includes('ICH Q2(R1)'))).toBe(true);
    });
  });

  describe('timeline estimates', () => {
    it('estimates >180 days for PAS + in vivo BE', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_3',
      }));
      expect(r.estimatedTimelineDays).toBeGreaterThan(180);
    });

    it('estimates ~30 days for annual report only', () => {
      const r = classifyVariation(variation({
        changeCategory: 'components_composition',
        excipientLevelChange: 'level_1',
      }));
      expect(r.estimatedTimelineDays).toBeLessThanOrEqual(60);
    });
  });

  describe('confidence', () => {
    it('lower confidence on sparse input', () => {
      const r = classifyVariation({
        dosageFormFamily: 'immediate_release_oral_solid',
        changeCategory: 'manufacturing_process',
      });
      expect(r.confidence).toBeLessThan(0.85);
    });

    it('higher confidence on fully-specified input', () => {
      const r = classifyVariation({
        dosageFormFamily: 'immediate_release_oral_solid',
        changeCategory: 'scale_up',
        scaleChangeFactor: 'within_10x',
        excipientLevelChange: 'level_1',
        siteChangeKind: 'within_same_facility',
        processChangeKind: 'minor_in_kind',
        affects: 'drug_product',
      });
      expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });
});
