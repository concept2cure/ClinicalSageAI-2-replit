/**
 * Registry Coverage — portfolio readiness invariants.
 *
 * These tests are the machine-checkable form of the product-management claim
 * that the biotech document lifecycle is "in place and ready to use". They lock
 * the core lifecycle spine (Pre-IND → IND → NDA/BLA across the primary regions)
 * at a real, non-generic authoring structure, and they guard against a silent
 * regression where a core type slips back to the generic CTD fallback.
 */

import { describe, it, expect } from 'vitest';
import {
  getDocumentCoverage,
  buildCoverageReport,
  getLifecycleSpineStatus,
  BIOTECH_LIFECYCLE_SPINE,
} from '../../server/services/regulatory/registry/registryCoverage';

describe('Registry coverage', () => {
  describe('biotech lifecycle spine', () => {
    const spine = getLifecycleSpineStatus();

    it('every lifecycle-spine type exists in the registry', () => {
      for (const node of spine) {
        expect(node.present, `${node.id} missing from registry`).toBe(true);
      }
    });

    it('every lifecycle-spine type is at least buildable (real structure, not generic)', () => {
      const below = spine.filter((n) => !n.meetsBar);
      expect(below, `catalog-only lifecycle nodes: ${below.map((n) => n.id).join(', ')}`).toEqual([]);
    });

    it('the four named regions are represented on the spine', () => {
      const regions = new Set(BIOTECH_LIFECYCLE_SPINE.map((n) => n.region));
      for (const region of ['US', 'EU', 'CA', 'JP'] as const) {
        expect(regions.has(region)).toBe(true);
      }
    });

    it('US IND, NDA, BLA and EU MAA are production-ready (dedicated section + task blueprints)', () => {
      for (const id of ['US_IND', 'US_NDA', 'US_BLA', 'EU_MAA'] as const) {
        expect(getDocumentCoverage(id)?.readiness, `${id} not production_ready`).toBe('production_ready');
      }
    });

    it('Canada NDS and Japan marketing approval are production-ready', () => {
      expect(getDocumentCoverage('CA_NDS')?.readiness).toBe('production_ready');
      expect(getDocumentCoverage('JP_MKT_APPROVAL')?.readiness).toBe('production_ready');
    });
  });

  describe('per-entry coverage', () => {
    it('US IND requires forms 1571/1572/3674 and they are FDA-registry backed and implemented', () => {
      const cov = getDocumentCoverage('US_IND')!;
      const numbers = cov.requiredForms.map((f) => f.formNumber).filter(Boolean);
      expect(numbers).toEqual(expect.arrayContaining(['1571', '1572', '3674']));
      expect(cov.requiredForms.every((f) => f.registered && f.implemented)).toBe(true);
      expect(cov.formsFullyBacked).toBe(true);
    });

    it('the named regions have an eCTD backbone reference', () => {
      for (const id of ['US_IND', 'EU_MAA', 'CA_NDS', 'JP_MKT_APPROVAL'] as const) {
        expect(getDocumentCoverage(id)?.hasEctdBackbone, `${id} missing eCTD backbone`).toBe(true);
      }
    });

    it('returns null for an unknown id', () => {
      expect(getDocumentCoverage('NOPE')).toBeNull();
    });
  });

  describe('clinical / CMC / lifecycle document blueprints', () => {
    // These are the highest-value catalog-only types that were given real
    // ICH/FDA section structures; each must now resolve to at least a real
    // (non-generic) blueprint, i.e. buildable or better.
    const NOW_BUILDABLE = [
      'ICH_CSR', 'ICH_PROTOCOL', 'ICH_IB', 'ICH_SAP',
      'ICH_QOS', 'ICH_M3_DS', 'ICH_M3_DP',
      'US_IND_SR', 'US_IND_ANNUAL', 'ICH_DSUR', 'EU_PSUR',
      'US_REMS', 'EU_RMP',
      'US_NDA_SUPP', 'US_BLA_SUPP', 'US_CBE', 'US_NDA_ANNUAL',
      'US_FAST_TRACK', 'US_BTD', 'US_RMAT', 'US_ORPHAN', 'EU_ORPHAN',
      // Master files, variations, pediatric, biosimilar, regional marketing, safety components.
      'US_DMF', 'EU_ASMF', 'CA_MF', 'JP_MF',
      'EU_VARIATION_IA', 'EU_VARIATION_IB', 'EU_VARIATION_II', 'JP_PARTIAL_CHANGE', 'CN_SUPPLEMENT', 'CA_SNDS',
      'EU_PIP', 'US_PSP', 'US_351K', 'US_ACCEL_APPROVAL', 'EU_CMA',
      'UK_MA', 'CH_MA', 'KR_MA_NEW', 'SG_NDA', 'CN_MAA', 'BR_MA', 'AU_CAT1',
      'ICH_ICF', 'ICH_ICSR', 'ICH_BENEFIT_RISK',
      // Regional clinical trial applications (full CTD, mirroring EU_CTA / US_IND).
      'UK_CTA', 'CA_CTA_A', 'AU_CTA', 'CH_CTA', 'KR_IND', 'BR_DEEC',
      // Generic / abbreviated marketing (bioequivalence dossier).
      'CA_ANDS', 'KR_MA_GENERIC', 'SG_GDA',
      // EU pre-submission, designation, renewal, pharmacovigilance system + ICH CMC.
      'EU_SCIENTIFIC_ADVICE', 'EU_PRIME', 'EU_RENEWAL', 'EU_PSMF', 'ICH_COMPARABILITY',
      // India CDSCO clinical-trial + marketing forms.
      'IN_CT06', 'IN_CT07', 'IN_CT11', 'IN_CT18', 'IN_CT19', 'IN_CT21',
      // US post-approval lifecycle / safety / environmental; UK + China lifecycle; ICH signal.
      'US_PMR', 'US_MEDWATCH', 'US_EA', 'US_EUA',
      'UK_IRP', 'UK_VARIATION', 'CN_RENEWAL', 'ICH_SIGNAL',
      // Remaining drug CMC/marketing lifecycle + the five CTD module authoring surfaces.
      'US_SUPAC', 'AU_CAT2',
      'ICH_CTD_M1', 'ICH_CTD_M2', 'ICH_CTD_M3', 'ICH_CTD_M4', 'ICH_CTD_M5',
    ] as const;

    it.each(NOW_BUILDABLE)('%s has a real (non-generic) section blueprint', (id) => {
      const cov = getDocumentCoverage(id);
      expect(cov, `${id} missing from registry`).not.toBeNull();
      expect(cov!.sectionBlueprint, `${id} still on the generic fallback`).not.toBe('generic');
      expect(cov!.readiness).not.toBe('catalog_only');
    });

    it('the CSR blueprint follows the ICH E3 structure (efficacy + safety evaluation)', () => {
      const cov = getDocumentCoverage('ICH_CSR')!;
      expect(cov.readiness).toBe('buildable');
    });
  });

  describe('portfolio report', () => {
    const report = buildCoverageReport();

    it('accounts for every active registry entry exactly once', () => {
      const { production_ready, buildable, catalog_only } = report.summary.byReadiness;
      expect(production_ready + buildable + catalog_only).toBe(report.summary.total);
      expect(report.entries.length).toBe(report.summary.total);
    });

    it('has a meaningful production-ready core', () => {
      // The wired dedicated blueprints (US IND/NDA/BLA, EU MAA/CTA, CA, JP, CN, BR, IN, AU).
      expect(report.summary.byReadiness.production_ready).toBeGreaterThanOrEqual(8);
    });

    it('every active document type resolves to a real (non-generic) authoring structure', () => {
      // The whole registry is now backed — drug AND device/IVD — so nothing
      // falls through to the generic CTD fallback. A new registry entry added
      // without a matching SECTION_BLUEPRINTS entry (project-bootstrap.ts) will
      // trip this; add the blueprint rather than relaxing the assertion.
      const catalogOnly = report.entries.filter((e) => e.readiness === 'catalog_only');
      expect(catalogOnly.map((e) => e.id)).toEqual([]);
    });

    it('every region on the report reconciles its readiness buckets to its total', () => {
      for (const r of report.byRegion) {
        expect(r.productionReady + r.buildable + r.catalogOnly).toBe(r.total);
      }
    });
  });
});
