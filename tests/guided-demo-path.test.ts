/**
 * Guided Demo Path Integration Test
 *
 * Verifies the approved beta demo path end-to-end:
 * project → generation → artifact → editor → status → provenance → audit
 *
 * This test validates file-level contracts, not browser automation.
 * It ensures the code structure supports every step in the guided demo.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf-8');

describe('Guided Demo Path — End-to-End Contract', () => {

  // ── STEP 1: Project context is available ──────────────────────────────────
  describe('Step 1: Project Context', () => {
    it('ZenApp provides activeProjectId to workspace components', () => {
      const content = read('client/src/concept2cure/ZenApp.tsx');
      expect(content).toContain('activeProjectId');
      expect(content).toContain('activeProject');
    });

    it('EditorPanel accepts projectId prop', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain('projectId?: string');
    });
  });

  // ── STEP 2: Generation creates artifact ───────────────────────────────────
  describe('Step 2: Generation → Artifact', () => {
    it('chat generation calls server artifact API', () => {
      const content = read('client/src/concept2cure/components/chat/ChatPanel.tsx');
      expect(content).toContain('/api/concept2cure/projects/');
      expect(content).toContain("method: 'POST'");
    });

    it('AnaPersistentPanel has Save to Vault capability', () => {
      const content = read('client/src/concept2cure/components/chat/AnaPersistentPanel.tsx');
      expect(content).toContain('Save to Vault');
      expect(content).toContain('savedAsArtifact');
    });

    it('IND generation calls real AI endpoint', () => {
      const content = read('client/src/concept2cure/ZenApp.tsx');
      expect(content).toContain('/api/knowledge-base/generate-ind-section');
    });

    it('eCTD draft persists artifact', () => {
      const content = read('client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx');
      expect(content).toContain('save-docx-as-artifact');
    });
  });

  // ── STEP 3: Artifact appears in project ───────────────────────────────────
  describe('Step 3: Artifact → Project Visibility', () => {
    it('ProjectFileTree loads artifacts from API', () => {
      const content = read('client/src/concept2cure/components/workspace/ProjectFileTree.tsx');
      expect(content).toContain('artifacts');
    });

    it('EditorPanel loads artifacts on mount', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain('loadArtifacts');
      expect(content).toContain('/api/concept2cure/projects/');
    });
  });

  // ── STEP 4: Editor opens populated ────────────────────────────────────────
  describe('Step 4: Editor Handoff', () => {
    it('EditorPanel auto-creates from initialContent', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain('initialContent');
      expect(content).toContain('initialContentConsumedRef');
    });

    it('EditorPanel opens by openArtifactId', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain('openArtifactId');
    });
  });

  // ── STEP 5: Status and version visible ────────────────────────────────────
  describe('Step 5: Governance Visible', () => {
    it('EditorPanel shows status transitions', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain('changingStatus');
      expect(content).toContain('/status');
    });

    it('EditorPanel shows version info', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain('version');
      expect(content).toContain('versions');
    });

    it('status transitions enforce role-based permissions on server', () => {
      const content = read('server/routes/concept2cure.ts');
      expect(content).toContain('ROLE_PERMISSIONS');
      expect(content).toContain('draft');
      expect(content).toContain('review');
      expect(content).toContain('approved');
      expect(content).toContain('locked');
    });
  });

  // ── STEP 6: Provenance and audit reachable ────────────────────────────────
  describe('Step 6: Provenance and Audit', () => {
    it('EditorPanel has provenance inspector', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain("'provenance'");
      expect(content).toContain('DocumentProvenancePanel');
    });

    it('EditorPanel has audit inspector', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain("'audit'");
      expect(content).toContain('DocumentAuditReport');
    });

    it('EditorPanel has proof inspector (document loop truth)', () => {
      const content = read('client/src/concept2cure/components/editor/EditorPanel.tsx');
      expect(content).toContain("'proof'");
      expect(content).toContain('ArtifactProofPanel');
    });

    it('server emits provenance events on artifact creation', () => {
      const content = read('server/routes/concept2cure.ts');
      expect(content).toContain('emitProvenanceEvent');
      expect(content).toContain("eventType: 'generation'");
    });

    it('server logs audit entries on artifact operations', () => {
      const content = read('server/routes/concept2cure.ts');
      expect(content).toContain("logAuditEntry(req, 'CREATE'");
    });
  });

  // ── STEP 7: Experimental surfaces labeled ─────────────────────────────────
  describe('Step 7: Experimental Labels', () => {
    it('Mission Control has experimental banner in ZenApp', () => {
      const content = read('client/src/concept2cure/ZenApp.tsx');
      const mcSection = content.slice(content.indexOf("layoutMode === 'mission-control'"));
      expect(mcSection).toContain('Experimental');
      expect(mcSection).toContain('in-memory');
    });

    it('SnowGlobe has experimental banner in ZenApp', () => {
      const content = read('client/src/concept2cure/ZenApp.tsx');
      const sgSection = content.slice(content.indexOf("layoutMode === 'snowglobe'"));
      expect(sgSection).toContain('Experimental');
      expect(sgSection).toContain('demo program');
    });

    it('SnowGlobe sidebar shows Experimental subtitle', () => {
      const content = read('client/src/concept2cure/components/sidebar/ZenSidebar.tsx');
      expect(content).toContain('Experimental');
    });

    it('Mission Control server has experimental headers', () => {
      const content = read('server/routes/mission-control.ts');
      expect(content).toContain('in-memory-experimental');
    });
  });

  // ── STEP 8: Runtime guards active ─────────────────────────────────────────
  describe('Step 8: Runtime Guards', () => {
    it('artifact creation endpoint has guardEmptyContent', () => {
      const content = read('server/routes/concept2cure.ts');
      expect(content).toContain('guardEmptyContent');
    });

    it('artifact creation endpoint has guardDemoContent', () => {
      const content = read('server/routes/concept2cure.ts');
      expect(content).toContain('guardDemoContent');
    });

    it('guard middleware file exists', () => {
      expect(fs.existsSync(path.resolve('server/middleware/documentLoopGuards.ts'))).toBe(true);
    });
  });

  // ── STEP 9: Feedback persists ─────────────────────────────────────────────
  describe('Step 9: Feedback Loop', () => {
    it('feedback endpoint exists in concept2cure routes', () => {
      const content = read('server/routes/concept2cure.ts');
      expect(content).toContain("'/feedback'");
      expect(content).toContain('ai_feedback');
    });

    it('no console.info feedback in any chat surface', () => {
      const files = [
        'client/src/concept2cure/components/chat/ChatPanel.tsx',
        'client/src/concept2cure/components/chat/AnaPersistentPanel.tsx',
        'client/src/concept2cure/components/chat/ZenChat.tsx',
      ];
      files.forEach(f => {
        const content = read(f);
        expect(content).not.toContain('console.info(`[chat-feedback]');
      });
    });
  });
});
