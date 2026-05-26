/**
 * AI Entry Point Contract Tests — Stage 12
 *
 * Validates that all primary AI generation paths either:
 * 1. Create governed artifacts (with lifecycle status, provenance, project scope)
 * 2. Are explicitly classified as non-artifact paths (analysis, metadata, health)
 *
 * These are structural/contract tests — they verify the shape of the
 * governed pipeline, not end-to-end generation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');

function fileContains(relPath: string, pattern: string | RegExp): boolean {
  const fullPath = join(ROOT, relPath);
  if (!existsSync(fullPath)) return false;
  const content = readFileSync(fullPath, 'utf-8');
  return typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
}

function fileExists(relPath: string): boolean {
  return existsSync(join(ROOT, relPath));
}

describe('Stage 12 — Governed Document Contract Enforcement', () => {

  describe('Contract definition exists and is canonical', () => {
    it('shared/types/document-contract.ts defines GovernedDocumentActionContract', () => {
      expect(fileContains(
        'shared/types/document-contract.ts',
        'GovernedDocumentActionContract'
      )).toBe(true);
    });

    it('contract defines required fields: projectId, documentType, lifecycleStatus, originSurface', () => {
      const path = 'shared/types/document-contract.ts';
      expect(fileContains(path, 'projectId')).toBe(true);
      expect(fileContains(path, 'documentType')).toBe(true);
      expect(fileContains(path, 'lifecycleStatus')).toBe(true);
      expect(fileContains(path, 'originSurface')).toBe(true);
    });

    it('contract defines ArtifactSourceSystem with all known source systems', () => {
      const path = 'shared/types/document-contract.ts';
      expect(fileContains(path, 'ArtifactSourceSystem')).toBe(true);
      expect(fileContains(path, 'ana_ri')).toBe(true);
      expect(fileContains(path, 'authoring_actions')).toBe(true);
    });

    it('contract defines ArtifactStatus lifecycle states', () => {
      const path = 'shared/types/document-contract.ts';
      expect(fileContains(path, "'draft'")).toBe(true);
      expect(fileContains(path, "'review'")).toBe(true);
      expect(fileContains(path, "'approved'")).toBe(true);
      expect(fileContains(path, "'locked'")).toBe(true);
    });

    it('contract validation function exists', () => {
      expect(fileContains(
        'shared/types/document-contract.ts',
        'validateGovernedDocumentActionContract'
      )).toBe(true);
    });
  });

  describe('Governed contract service exists and is wired', () => {
    it('governedDocumentContractService.ts exists', () => {
      expect(fileExists(
        'server/services/concept2cure/governedDocumentContractService.ts'
      )).toBe(true);
    });

    it('service exports resolveGovernedContext', () => {
      expect(fileContains(
        'server/services/concept2cure/governedDocumentContractService.ts',
        'resolveGovernedContext'
      )).toBe(true);
    });
  });

  describe('Primary AI generation paths use governed contract', () => {
    it('ana-ri.ts /generate uses artifact creation with draft status', () => {
      expect(fileContains(
        'server/routes/ana-ri.ts',
        'generate'
      )).toBe(true);
      expect(fileContains(
        'server/routes/ana-ri.ts',
        'draft'
      )).toBe(true);
    });

    it('ana-ri.ts /chat uses processResponseActions for conditional artifact creation', () => {
      expect(fileContains(
        'server/routes/ana-ri.ts',
        'processResponseActions'
      )).toBe(true);
    });

    it('authoring-actions.ts imports resolveGovernedContext', () => {
      expect(fileContains(
        'server/routes/authoring-actions.ts',
        'resolveGovernedContext'
      )).toBe(true);
    });

    it('authoring-actions.ts sends governed contract errors on validation failure', () => {
      expect(fileContains(
        'server/routes/authoring-actions.ts',
        'GOVERNED_CONTRACT_INVALID'
      )).toBe(true);
    });

    it('concept2cure.ts artifact creation route exists', () => {
      expect(fileContains(
        'server/routes/concept2cure.ts',
        'artifacts'
      )).toBe(true);
    });
  });

  describe('AI action system enforces typed action dispatch', () => {
    it('shared/types/ai-actions.ts defines AIActionType union', () => {
      expect(fileContains(
        'shared/types/ai-actions.ts',
        'AIActionType'
      )).toBe(true);
    });

    it('ai-actions.ts route exists with /execute endpoint', () => {
      expect(fileContains(
        'server/routes/ai-actions.ts',
        '/execute'
      )).toBe(true);
    });

    it('ai-actions.ts has action type registry (/types endpoint)', () => {
      expect(fileContains(
        'server/routes/ai-actions.ts',
        '/types'
      )).toBe(true);
    });

    it('ai-actions.ts tracks execution history (/history endpoint)', () => {
      expect(fileContains(
        'server/routes/ai-actions.ts',
        '/history'
      )).toBe(true);
    });
  });

  describe('AI gateway is the canonical LLM access layer', () => {
    it('ai-gateway directory exists', () => {
      expect(fileExists('server/services/ai-gateway')).toBe(true);
    });

    it('ana-ri.ts uses the AI gateway (not direct OpenAI/Anthropic)', () => {
      const content = readFileSync(
        join(ROOT, 'server/routes/ana-ri.ts'),
        'utf-8'
      );
      expect(content).toContain('gateway');
      expect(content).not.toMatch(/new OpenAI\(/);
      expect(content).not.toMatch(/new Anthropic\(/);
    });

    it('chat.ts uses the AI gateway', () => {
      expect(fileContains('server/routes/chat.ts', 'gateway')).toBe(true);
    });
  });

  describe('Governed artifact lifecycle paths exist', () => {
    it('promote-artifact handler exists in ai-actions', () => {
      expect(fileExists(
        'server/services/ai-actions/handlers/promote-artifact.ts'
      )).toBe(true);
    });

    it('promote-artifact handler uses resolveGovernedContext', () => {
      expect(fileContains(
        'server/services/ai-actions/handlers/promote-artifact.ts',
        'resolveGovernedContext'
      )).toBe(true);
    });
  });

  describe('Existing governance tests are in place', () => {
    it('authoring-actions-governance.test.ts exists', () => {
      expect(fileExists(
        'tests/routes/authoring-actions-governance.test.ts'
      )).toBe(true);
    });

    it('concept2cure-governed-upload.test.ts exists', () => {
      expect(fileExists(
        'tests/routes/concept2cure-governed-upload.test.ts'
      )).toBe(true);
    });

    it('governedDocumentContractService.test.ts exists', () => {
      expect(fileExists(
        'server/services/__tests__/governedDocumentContractService.test.ts'
      )).toBe(true);
    });
  });
});

describe('Stage 12 — AI Entry Point Classification', () => {

  describe('Governed paths (create artifacts through contract)', () => {
    const governedPaths = [
      { file: 'server/routes/ana-ri.ts', desc: 'AnA RI chat/generate' },
      { file: 'server/routes/authoring-actions.ts', desc: 'Authoring actions' },
      { file: 'server/routes/ai-actions.ts', desc: 'AI actions dispatch' },
      { file: 'server/routes/compute.ts', desc: 'Compute plane' },
    ];

    for (const { file, desc } of governedPaths) {
      it(`${desc} (${file}) exists as governed path`, () => {
        expect(fileExists(file)).toBe(true);
      });
    }
  });

  describe('Non-artifact paths (analysis, metadata, health — acceptable bypasses)', () => {
    const nonArtifactPaths = [
      { file: 'server/routes/ai-assistance.ts', desc: 'AI assistance (text-only, no persist)' },
      { file: 'server/routes/ai-claims-routes.ts', desc: 'Claims binder (IVDR linkage, not general gen)' },
    ];

    for (const { file, desc } of nonArtifactPaths) {
      it(`${desc} (${file}) exists as non-artifact path`, () => {
        expect(fileExists(file)).toBe(true);
      });
    }
  });

  describe('Legacy paths (exist but not in beta shell — monitor only)', () => {
    const legacyFiles = [
      // 'client/src/components/ai/AnAAssistant.jsx' — deleted in the AnA
      // capabilities-audit cleanup (never-opened legacy overlay, superseded
      // by the bundle ana_ri shell). Removed from this list since the file
      // no longer exists.
      // 'client/src/components/coauthor/LumenChatPane.jsx' — deleted in 7a144fd
      // ("chore: delete all non-Claude-Design UI under client/src/") per the
      // CLAUDE.md design-system mandate. Removed from this list since the
      // file no longer exists; the legacy-path tracker still serves the
      // remaining files.
      'client/src/services/openaiService.js',
    ];

    for (const file of legacyFiles) {
      it(`Legacy AI surface ${file} exists (not in beta path)`, () => {
        expect(fileExists(file)).toBe(true);
      });
    }
  });
});
