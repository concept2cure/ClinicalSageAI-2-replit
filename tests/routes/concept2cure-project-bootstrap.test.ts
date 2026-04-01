/**
 * Tests for the project bootstrap integration — ensures the
 * bootstrapFromRegistry function produces valid data for all
 * key submission types that the POST /projects endpoint consumes.
 */

import { describe, it, expect } from 'vitest';
import { bootstrapFromRegistry } from '../../server/services/regulatory/projectBootstrapFromRegistry';
import { normalizeProjectMetadata } from '../../server/services/regulatory/projectMetadataNormalizer';
import { buildDefaultInstructions, buildInstructionsFromLegacyType } from '../../server/services/regulatory/defaultInstructionBuilder';
import { getSuggestedActions } from '../../server/services/regulatory/suggestedActionsCatalog';
import { getTemplatesForType } from '../../server/services/regulatory/templateCatalog';
import { validateGovernedDocumentActionContract } from '../../shared/types/document-contract';
import { getApplicationType } from '../../shared/regulatory/global-document-registry';

describe('Project Bootstrap Integration', () => {
  describe('all legacy types produce valid bootstrap', () => {
    const legacyTypes = ['IND', 'NDA', 'BLA', '510K', 'PMA', 'DE_NOVO', 'EUA', 'MAA'];

    for (const type of legacyTypes) {
      it(`bootstraps ${type} without error`, async () => {
        const result = await bootstrapFromRegistry({ submissionType: type, product: 'Test Product' });
        expect(result).not.toBeNull();
        expect(result!.entry).toBeDefined();
        expect(result!.sections.length).toBeGreaterThan(0);
        expect(result!.defaultInstructions).toBeTruthy();
        expect(result!.dossierStandard).toBeTruthy();
      });
    }
  });

  describe('all new registry types produce valid bootstrap', () => {
    const newTypes = ['EU_CTA', 'CA_NDS', 'JP_MKT_APPROVAL', 'CN_CTA', 'AU_CTN', 'BR_DDCM', 'IN_CT04'];

    for (const type of newTypes) {
      it(`bootstraps ${type} without error`, async () => {
        const result = await bootstrapFromRegistry({ registryId: type, product: 'Test Product' });
        expect(result).not.toBeNull();
        expect(result!.entry.id).toBe(type);
        expect(result!.sections.length).toBeGreaterThan(0);
      });
    }
  });

  describe('normalizeProjectMetadata', () => {
    it('normalizes IND input', () => {
      const meta = normalizeProjectMetadata({
        name: 'Test',
        submissionType: 'IND',
        product: 'Drug X',
      });
      expect(meta.registryId).toBe('US_IND');
      expect(meta.region).toBe('US');
      expect(meta.agency).toBe('FDA');
      expect(meta.submissionType).toBe('IND');
    });

    it('normalizes registryId input', () => {
      const meta = normalizeProjectMetadata({
        name: 'Test',
        registryId: 'EU_MAA',
      });
      expect(meta.registryId).toBe('EU_MAA');
      expect(meta.region).toBe('EU');
      expect(meta.agency).toBe('EMA');
    });

    it('handles unknown type gracefully', () => {
      const meta = normalizeProjectMetadata({
        name: 'Test',
        submissionType: 'UNKNOWN_TYPE',
      });
      expect(meta.registryId).toBeNull();
      expect(meta.submissionType).toBe('UNKNOWN_TYPE');
    });

    it('preserves user-supplied region over registry default', () => {
      const meta = normalizeProjectMetadata({
        name: 'Test',
        submissionType: 'IND',
        region: 'CUSTOM_REGION',
      });
      expect(meta.region).toBe('CUSTOM_REGION');
    });
  });

  describe('buildDefaultInstructions', () => {
    it('generates specialized instructions for US_IND', () => {
      const entry = getApplicationType('US_IND')!;
      const instructions = buildDefaultInstructions(entry, 'Compound X');
      expect(instructions).toContain('IND');
      expect(instructions).toContain('Compound X');
      expect(instructions).toContain('FDA');
    });

    it('generates specialized instructions for EU_MAA', () => {
      const entry = getApplicationType('EU_MAA')!;
      const instructions = buildDefaultInstructions(entry, 'Drug Y');
      expect(instructions).toContain('MAA');
      expect(instructions).toContain('Drug Y');
    });

    it('generates generic instructions for types without specialized template', () => {
      const entry = getApplicationType('CH_CTA')!;
      const instructions = buildDefaultInstructions(entry, 'Drug Z');
      expect(instructions).toContain('Drug Z');
      expect(instructions).toContain('Switzerland');
    });
  });

  describe('buildInstructionsFromLegacyType', () => {
    it('resolves legacy IND to instructions', () => {
      const instructions = buildInstructionsFromLegacyType('IND', 'Test Drug');
      expect(instructions).toContain('IND');
      expect(instructions).toContain('Test Drug');
    });

    it('falls back gracefully for unknown types', () => {
      const instructions = buildInstructionsFromLegacyType('CUSTOM', 'Product');
      expect(instructions).toContain('CUSTOM');
      expect(instructions).toContain('Product');
    });
  });

  describe('getSuggestedActions', () => {
    it('returns actions for IND', () => {
      const actions = getSuggestedActions('IND');
      expect(actions.length).toBeGreaterThan(3);
      expect(actions.some(a => a.command === '/dossier')).toBe(true);
    });

    it('returns device-specific actions for 510K', () => {
      const actions = getSuggestedActions('510K');
      expect(actions.some(a => a.id === 'predicates')).toBe(true);
    });

    it('returns EU-specific actions for EU_MAA', () => {
      const actions = getSuggestedActions('EU_MAA');
      expect(actions.some(a => a.command === '/pathway')).toBe(true);
    });

    it('returns actions sorted by priority', () => {
      const actions = getSuggestedActions('IND');
      for (let i = 1; i < actions.length; i++) {
        expect(actions[i].priority).toBeGreaterThanOrEqual(actions[i - 1].priority);
      }
    });
  });

  describe('getTemplatesForType', () => {
    it('returns CTD templates for IND', () => {
      const templates = getTemplatesForType('IND');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.id === 'clinical_overview')).toBe(true);
    });

    it('returns device templates for 510K', () => {
      const templates = getTemplatesForType('510K');
      expect(templates.some(t => t.id === 'device_description')).toBe(true);
    });

    it('returns EU-specific templates for EU_MAA', () => {
      const templates = getTemplatesForType('EU_MAA');
      expect(templates.some(t => t.id === 'smpc')).toBe(true);
      expect(templates.some(t => t.id === 'rmp')).toBe(true);
    });

  });

  describe('governed project assignment', () => {
    it('requires projectId for governed documents', () => {
      const result = validateGovernedDocumentActionContract({
        projectId: 0 as any,
        artifactId: 1001,
        documentType: 'ind-briefing',
        originSurface: 'project_workspace_shell',
        generationMode: 'manual',
        lifecycleStatus: 'draft',
        clientTrack: 'biotech',
        submissionProgram: 'ind',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'literature',
        documentClass: 'submission_component',
        readinessGate: 'internal_review',
        approvalPathType: 'regulated_dual_review',
        recommendationSource: 'ind_autodraft',
        workspaceTarget: 'project',
        regulatorIntent: 'submission_authoring',
        editorPayload: {
          title: 'IND package draft',
          content: 'Controlled regulatory content for project submission',
          ctdSection: '1.2',
        },
        placementTarget: {
          workspace: 'project',
        },
        exportEligibility: {
          allowed: false,
        },
      } as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('projectId is required');
    });
  });
});
