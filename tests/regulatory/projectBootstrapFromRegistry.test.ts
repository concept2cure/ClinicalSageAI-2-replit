/**
 * Tests for the Registry-driven Project Bootstrap.
 */

import { describe, it, expect } from 'vitest';
import { bootstrapFromRegistry, getSectionCountForType } from '../../server/services/regulatory/projectBootstrapFromRegistry';

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

    it('bootstraps Canada NDS from registryId', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'CA_NDS' });
      expect(result).not.toBeNull();
      expect(result!.entry.agency).toBe('Health_Canada');
    });

    it('bootstraps Japan marketing approval', async () => {
      const result = await bootstrapFromRegistry({ registryId: 'JP_MKT_APPROVAL' });
      expect(result).not.toBeNull();
      expect(result!.entry.agency).toBe('PMDA');
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
