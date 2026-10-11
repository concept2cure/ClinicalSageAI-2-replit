/**
 * Tests for the Registry-driven Project Bootstrap.
 */

import { describe, it, expect } from 'vitest';
import { bootstrapFromRegistry, getSectionCountForType } from '../../server/services/regulatory/projectBootstrapFromRegistry';
import { getSectionBlueprint, getSectionBlueprintContext } from '../../server/services/regulatory/sectionBlueprintCatalog';

describe('Project Bootstrap from Registry', () => {
  describe('bootstrapFromRegistry', () => {
    it('bootstraps US IND from legacy type', async () => {
      const result = await bootstrapFromRegistry({ submissionType: 'IND' });
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('US_IND');
      expect(result!.sections.length).toBeGreaterThan(0);
      expect(result!.dossierStandard).toBe('eCTD');
      expect(result!.defaultInstructions).toContain('IND');
    });

    it('bootstraps US IND from registryId', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'US_IND' });
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('US_IND');
      expect(result!.sections.length).toBeGreaterThan(10);
    });

    it('bootstraps EU MAA from legacy type', async () => {
      const result = await bootstrapFromRegistry({ submissionType: 'MAA' });
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('EU_MAA');
      expect(result!.entry.region).toBe('EU');
      expect(result!.sections.length).toBeGreaterThan(0);
    });

    it('bootstraps 510K from legacy type', async () => {
      const result = await bootstrapFromRegistry({ submissionType: '510K' });
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('US_510K');
      expect(result!.entry.dossierStandard).toBe('eSTAR');
    });

    it('bootstraps BLA from registryId', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'US_BLA' });
      expect(result).not.toBeNull();
      expect(result!.entry.applicationFamily).toBe('marketing_authorization');
    });

    it('bootstraps EU CTA from registryId', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'EU_CTA' });
      expect(result).not.toBeNull();
      expect(result!.entry.agency).toBe('EMA');
    });

    it('bootstraps Canada NDS from registryId with the dedicated HC blueprint', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'CA_NDS' });
      expect(result).not.toBeNull();
      expect(result!.entry.agency).toBe('Health_Canada');
      // The dedicated Health Canada blueprint contributes a Product Monograph in
      // Module 1 that the generic CTD fallback does not have.
      expect(result!.sections.some(s => /product monograph/i.test(s.title))).toBe(true);
      expect(result!.sections.every(s => s.metadata?.dedicatedBlueprint === true)).toBe(true);
    });

    it('bootstraps Japan marketing approval with the dedicated PMDA blueprint', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'JP_MKT_APPROVAL' });
      expect(result).not.toBeNull();
      expect(result!.entry.agency).toBe('PMDA');
      // Japan Module 1 requires local-agent information — absent from generic CTD.
      expect(result!.sections.some(s => /local agent/i.test(s.title))).toBe(true);
      expect(result!.milestones.length).toBeGreaterThan(0);
    });

    it('returns null for unknown type', async () => {
      const result = await bootstrapFromRegistry({ submissionType: 'FAKE' });
      expect(result).toBeNull();
    });

    it('returns null when no type specified', async () => {
      const result = await bootstrapFromRegistry({});
      expect(result).toBeNull();
    });

    it('generates instructions with product name', async () => {
      const result = await bootstrapFromRegistry({
        registryId: 'US_NDA',
        product: 'Compound X',
      });
      expect(result).not.toBeNull();
      expect(result!.defaultInstructions).toContain('Compound X');
    });

    it('each section row has required fields', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'EU_MAA' });
      expect(result).not.toBeNull();
      for (const section of result!.sections) {
        expect(section.sectionCode).toBeTruthy();
        expect(section.title).toBeTruthy();
        expect(section.module).toBeTruthy();
        expect(section.status).toBe('not_started');
        expect(section.priority).toMatch(/^(high|medium|low)$/);
        expect(section.metadata).toBeDefined();
      }
    });
  });

  describe('getSectionCountForType', () => {
    it('returns count for US_IND', async () => {
      const count = await getSectionCountForType('US_IND');
      expect(count).toBeGreaterThan(0);
    });

    it('returns count for legacy type', async () => {
      const count = await getSectionCountForType('MAA');
      expect(count).toBeGreaterThan(0);
    });

    it('returns 0 for unknown type', async () => {
      const count = await getSectionCountForType('FAKE');
      expect(count).toBe(0);
    });
  });

});

describe('regional and standalone authoring groups', () => {
    it('seeds CTIS Form/MSC and Parts I/II as authoring groups rather than CTD modules', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'EU_CTA' });
      expect(result!.sections.find(s => s.sectionCode === 'FORM.COVER')?.module).toBe('CTIS Form/MSC');
      expect(result!.sections.find(s => s.sectionCode === 'MSC')?.module).toBe('CTIS Form/MSC');
      expect(result!.sections.find(s => s.sectionCode === 'PART_I.PROTOCOL')?.module).toBe('CTIS Part I');
      expect(result!.sections.find(s => s.sectionCode === 'PART_II.CONSENT')?.module).toBe('CTIS Part II');
      expect(new Set(result!.sections.map(s => s.module))).toEqual(new Set(['CTIS Form/MSC', 'CTIS Part I', 'CTIS Part II']));
    });

    it('seeds the Japan notification outline with a Notification group', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'JP_CTN' });
      expect(result!.sections.length).toBeGreaterThan(0);
      expect(result!.sections.every(s => s.module === 'Notification')).toBe(true);
      expect(result!.sections.map(s => s.sectionCode)).toEqual((await getSectionBlueprint('JP_CTN'))!.sections.map(s => s.code));
    });

    it('seeds the dedicated amendment components instead of the initial IND deep dossier', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'US_IND_AMENDMENT' });
      const blueprint = (await getSectionBlueprint('US_IND_AMENDMENT'))!;
      expect(result!.usedDeepAdapter).toBe(false);
      expect(result!.sections.map(s => s.sectionCode)).toEqual(blueprint.sections.map(s => s.code));
      expect(result!.sections.every(s => s.module === 'Amendment')).toBe(true);
      expect(result!.sections.find(s => s.sectionCode === 'amendment.protocol')?.metadata.required).toBe(false);
      expect(result!.sections.find(s => s.sectionCode === 'amendment.form_1571')?.metadata.required).toBe(true);
      expect(result!.sections.every(s => s.metadata.dedicatedBlueprint === true)).toBe(true);
      expect(await getSectionCountForType('US_IND_AMENDMENT')).toBe(result!.sections.length);
    });

    for (const id of ['ICH_DSUR', 'ICH_CSR']) {
      it(`${id} uses Document for standalone module-zero rows`, async () => {
        const result = await bootstrapFromRegistry({ registryId: id });
        expect(result!.sections.length).toBeGreaterThan(0);
        expect(result!.sections.every(s => s.module === 'Document')).toBe(true);
        expect(result!.sections.map(s => s.sectionCode)).toEqual((await getSectionBlueprint(id))!.sections.map(s => s.code));
      });
    }

    for (const id of ['EU_CTA', 'JP_CTN', 'US_IND_AMENDMENT', 'CA_CTA', 'CA_CTA_A']) {
      it(`${id} preserves outline provenance and limitations on every stored section row`, async () => {
        const result = await bootstrapFromRegistry({ registryId: id });
        const context = getSectionBlueprintContext(id);
        expect(context.limitations.length).toBeGreaterThan(0);
        for (const section of result!.sections) {
          expect(section.metadata.outlineLimitations).toEqual(context.limitations);
          if (context.basis) expect(section.metadata.outlineBasis).toEqual(context.basis);
        }
      });
    }

    it('preserves genuine CTD M1–M5 labels, including the initial US IND deep adapter', async () => {
      const ind = await bootstrapFromRegistry({ registryId: 'US_IND' });
      expect(ind!.usedDeepAdapter).toBe(true);
      expect(ind!.sections.every(s => /^M[1-5]$/.test(s.module))).toBe(true);
      for (const id of ['US_NDA', 'EU_MAA', 'CA_CTA', 'CA_CTA_A', 'ICH_NONCLIN_SUMMARY']) {
        const result = await bootstrapFromRegistry({ registryId: id });
        const blueprint = (await getSectionBlueprint(id))!;
        expect(result!.sections.map(s => s.module)).toEqual(blueprint.sections.map(s => `M${s.module}`));
      }
    });
});
