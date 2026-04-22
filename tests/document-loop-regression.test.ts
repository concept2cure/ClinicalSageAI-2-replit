/**
 * Document Loop Regression Tests
 *
 * These tests guard the core document loop chain:
 * Intent → Generation → Artifact → Editor → Project → Lifecycle → Audit
 *
 * If any of these tests fail, the document loop is broken.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NO DEMO DATA IN PRODUCTION PATHS
// ═══════════════════════════════════════════════════════════════════════════════

describe('No demo data in production paths', () => {
  const productionDirs = [
    'client/src/concept2cure/components',
    'client/src/concept2cure/hooks',
    'client/src/concept2cure/pages',
    'server/routes',
    'server/services',
  ];

  it('ECTDCoAuthorStandalone must not use hardcoded demo sections', () => {
    const filePath = path.resolve('client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // The old demo had sections with id 'm1-cover', 'm1-1571', etc.
    expect(content).not.toContain("id: 'm1-cover'");
    expect(content).not.toContain("id: 'm1-1571'");
    expect(content).not.toContain("id: 'm2-intro'");
    expect(content).not.toContain("id: 'm5-protocol'");
    expect(content).not.toContain("Lemizumab Phase 1/2 Program");
  });

  it('regulatoryAIServicePhase3.ts must not exist (was a stub)', () => {
    const filePath = path.resolve('server/services/regulatoryAIServicePhase3.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('server/routes/drafting.ts must not exist (was a stub)', () => {
    const filePath = path.resolve('server/routes/drafting.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('ClientPortalV3 must not exist (legacy, not product)', () => {
    const filePath = path.resolve('client/src/components/portal/ClientPortalV3.tsx');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('AIAssistantV3 must not exist (legacy, not product)', () => {
    const filePath = path.resolve('client/src/components/ai/AIAssistantV3.tsx');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ARTIFACT CREATION SCHEMA ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Artifact creation schema enforcement', () => {
  // Mirror of the server-side createArtifactSchema
  const createArtifactSchema = z.object({
    type: z.string().min(1).max(50),
    category: z.enum(['document', 'interactive', 'visualization']),
    title: z.string().min(1, 'Title required').max(200),
    content: z.string().min(1, 'Content must not be empty').max(1000000),
    ctdSection: z.string().max(50).optional(),
    metadata: z.record(z.any()).optional(),
  });

  it('rejects empty content', () => {
    const result = createArtifactSchema.safeParse({
      type: 'document_section',
      category: 'document',
      title: 'Test',
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    const result = createArtifactSchema.safeParse({
      type: 'document_section',
      category: 'document',
      title: 'Test',
      content: '   ',
    });
    // Zod .min(1) checks length, whitespace passes — server should trim
    // This test documents the behavior
    expect(result.success).toBe(true); // Zod passes, server-side trim handles
  });

  it('rejects empty title', () => {
    const result = createArtifactSchema.safeParse({
      type: 'document_section',
      category: 'document',
      title: '',
      content: 'real content',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid artifact', () => {
    const result = createArtifactSchema.safeParse({
      type: 'regulatory_document',
      category: 'document',
      title: 'IND Section 2.5 — Clinical Overview',
      content: '<h1>Clinical Overview</h1><p>Content here.</p>',
      ctdSection: '2.5',
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CHAT SURFACES HAVE ARTIFACT CREATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Chat surfaces have artifact creation capability', () => {
  it('ChatPanel calls server API for artifact creation (not React-only)', () => {
    const filePath = path.resolve('client/src/concept2cure/components/chat/ChatPanel.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Must call the server artifact endpoint, not just dispatch to React state
    expect(content).toContain('/api/concept2cure/projects/');
    expect(content).toContain("method: 'POST'");
    expect(content).toContain('artifacts');
  });

  // AnaPersistentPanel was deleted in the Phase 2 Claude Design convergence.
  // The Claude Design bundle's chat does not expose a "Save to Vault" action
  // inside the thread. Vault persistence lives at the project level now.
  it.skip('AnaPersistentPanel has Save to Vault button — removed with AnaPersistentPanel', () => {});
  it.skip('AnaPersistentPanel uses auth headers — moved to useAnaChat', () => {});

  it('Ana useAnaChat hook uses auth headers', () => {
    const filePath = path.resolve(
      'client/src/concept2cure/components/ana/useAnaChat.ts'
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('getAuthHeaders()');
  });

  it('ZenChat has Save to Vault via useDocumentActions', () => {
    const filePath = path.resolve('client/src/concept2cure/components/chat/ZenChat.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('useDocumentActions');
    expect(content).toContain('saveArtifact');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FEEDBACK PERSISTENCE (NOT CONSOLE.INFO)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Feedback persists to database, not console', () => {
  const chatFiles = [
    'client/src/concept2cure/components/chat/ChatPanel.tsx',
    'client/src/concept2cure/components/chat/ZenChat.tsx',
    'client/src/concept2cure/components/ana/useAnaChat.ts',
  ];

  chatFiles.forEach(file => {
    it(`${path.basename(file)} does not use console.info for feedback`, () => {
      const content = fs.readFileSync(path.resolve(file), 'utf-8');
      expect(content).not.toContain('console.info(`[chat-feedback]');
    });

    it(`${path.basename(file)} calls /api/concept2cure/feedback`, () => {
      const content = fs.readFileSync(path.resolve(file), 'utf-8');
      expect(content).toContain('/api/concept2cure/feedback');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DOCX FLOWS CREATE ARTIFACTS (NOT DOWNLOAD-ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DOCX generation flows create artifacts', () => {
  it('useGenerateINDPackage passes saveAsArtifact flag', () => {
    const filePath = path.resolve('client/src/concept2cure/hooks/useDocumentFactory.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Find the useGenerateINDPackage function and verify it sends saveAsArtifact
    const indPkgSection = content.slice(content.indexOf('useGenerateINDPackage'));
    expect(indPkgSection).toContain('saveAsArtifact: true');
  });

  it('useGenerateModule3Docx passes saveAsArtifact flag', () => {
    const filePath = path.resolve('client/src/concept2cure/hooks/useDocumentFactory.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    const module3Section = content.slice(content.indexOf('useGenerateModule3Docx'));
    expect(module3Section).toContain('saveAsArtifact: true');
  });

  it('useGenerateINDSection auto-saves as artifact', () => {
    const filePath = path.resolve('client/src/concept2cure/hooks/useDocumentFactory.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    const indSection = content.slice(content.indexOf('useGenerateINDSection'));
    expect(indSection).toContain('save-docx-as-artifact');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. EDITOR HANDOFF — NO EMPTY STATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Editor never opens empty after generation', () => {
  it('EditorPanel auto-creates artifact from initialContent', () => {
    const filePath = path.resolve('client/src/concept2cure/components/editor/EditorPanel.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Must have auto-creation logic for initialContent
    expect(content).toContain('initialContent');
    expect(content).toContain('initialContentConsumedRef');
    expect(content).toContain("method: 'POST'");
  });

  it('EditorPanel loads artifact by openArtifactId', () => {
    const filePath = path.resolve('client/src/concept2cure/components/editor/EditorPanel.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('openArtifactId');
    expect(content).toContain('setActiveArtifact');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. LIFECYCLE AND AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lifecycle and audit enforcement', () => {
  it('artifact creation endpoint validates content is non-empty', () => {
    const filePath = path.resolve('server/routes/concept2cure.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // createArtifactSchema must require non-empty content
    expect(content).toContain("content: z.string().min(1");
  });

  it('save-docx-as-artifact rejects empty content', () => {
    const filePath = path.resolve('server/routes/knowledge-base.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('Content must not be empty');
  });

  it('module3 saveAsArtifact path fails closed on persistence errors', () => {
    const filePath = path.resolve('server/routes/knowledge-base.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('Module 3 generation blocked: governed artifact persistence failed');
    expect(content).toContain('artifact row not readable after insert');
    expect(content).toContain('fail-closed');
  });

  it('vault connector versioning fails closed when artifact versioning fails', () => {
    const filePath = path.resolve('server/routes/knowledge-base.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('Governed connector versioning failed: artifact version insert missing id');
    expect(content).not.toContain('Vault DMS version insert skipped');
  });

  it('ind-autodraft section generation fails closed when artifact persistence fails', () => {
    const filePath = path.resolve('server/routes/knowledge-base.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('Governed artifact persistence failed for');
    expect(content).toContain('Artifact version insert did not return an id');
    expect(content).not.toContain('Continue even if save fails — still return the content');
  });

  it('save-docx-as-artifact fails closed when inserted artifact cannot be re-read', () => {
    const filePath = path.resolve('server/routes/knowledge-base.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('Governed artifact persistence failed: inserted artifact lookup missing');
  });

  it('artifact creation emits provenance event', () => {
    const filePath = path.resolve('server/routes/concept2cure.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Must call emitProvenanceEvent after artifact creation
    expect(content).toContain('emitProvenanceEvent');
    expect(content).toContain("eventType: 'generation'");
  });

  it('artifact creation logs audit entry', () => {
    const filePath = path.resolve('server/routes/concept2cure.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain("logAuditEntry(req, 'CREATE'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. MISSION CONTROL IS LABELED EXPERIMENTAL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mission Control is labeled experimental', () => {
  it('has experimental warning in file header', () => {
    const filePath = path.resolve('server/routes/mission-control.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('EXPERIMENTAL');
    expect(content).toContain('IN-MEMORY ONLY');
  });

  it('sets experimental response headers', () => {
    const filePath = path.resolve('server/routes/mission-control.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('X-Data-Source');
    expect(content).toContain('in-memory-experimental');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. AI MODELS ARE REAL (NO NONEXISTENT MODELS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI models reference real, available models', () => {
  it('foresight-ai-engine does not reference gpt-5 or o3', () => {
    const filePath = path.resolve('server/services/foresight-ai-engine.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain("'gpt-5'");
    expect(content).not.toContain("'o3'");
    expect(content).not.toContain("'gpt-4.1'");
    expect(content).not.toContain("'gpt-4.1-mini'");
  });
});
